import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RiskAssessment } from '../../generated/prisma/client.js';
import {
  ReminderStatus,
  ReminderType,
  RiskBadge,
} from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import type { TriageAnalysisResponse } from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRiskAssessmentInternalDto } from './dto/create-risk-assessment-internal.dto.js';
import { RiskAssessmentsCacheService } from './risk-assessments-cache.service.js';

interface Pagination {
  limit: number;
  offset: number;
}

interface AssessmentInput {
  pregnancy_profile_id: string;
  symptom_checkin_id?: string | null;
  triage_score: number;
  anemia_probability?: number | null;
  preeclampsia_probability?: number | null;
  aggregate_score: number;
  risk_badge: RiskBadge;
  risk_factors: string[];
  recommendation_text: string;
}

interface PrismaKnownRequestError {
  code: string;
}

export interface CreateRiskAssessmentResult {
  assessment: RiskAssessment;
  created: boolean;
}

const isUniqueConstraintError = (
  error: unknown,
): error is PrismaKnownRequestError => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (error as Error & Partial<PrismaKnownRequestError>).code === 'P2002';
};

@Injectable()
export class RiskAssessmentsService {
  private static readonly LATEST_CACHE_TTL_SECONDS = 10 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
    private readonly cache: RiskAssessmentsCacheService,
  ) {}

  createFromCallback(
    dto: CreateRiskAssessmentInternalDto,
  ): Promise<CreateRiskAssessmentResult> {
    return this.createAssessment(dto);
  }

  async createFromAiResponse(
    pregnancyProfileId: string,
    symptomCheckinId: string,
    aiResponse: TriageAnalysisResponse,
  ) {
    const result = await this.createAssessment({
      pregnancy_profile_id: pregnancyProfileId,
      symptom_checkin_id: symptomCheckinId,
      // Kontrak triage publik hanya menjamin aggregate_score. Nilai itu
      // dipakai sebagai skor triage bila service belum mengirim skor terpisah.
      triage_score: aiResponse.triage_score ?? aiResponse.aggregate_score,
      anemia_probability: aiResponse.anemia_probability,
      preeclampsia_probability: aiResponse.preeclampsia_probability,
      aggregate_score: aiResponse.aggregate_score,
      risk_badge: aiResponse.risk_badge,
      risk_factors: aiResponse.risk_factors,
      recommendation_text: aiResponse.recommendation_text,
    });

    return result.assessment;
  }

  async findByProfile(
    profileId: string,
    pagination: Pagination,
    requester: CurrentUserData,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const where = { pregnancy_profile_id: profileId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.riskAssessment.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.riskAssessment.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester: CurrentUserData) {
    const assessment = await this.prisma.riskAssessment.findUnique({
      where: { id },
    });

    if (!assessment) {
      throw new NotFoundException('Risk assessment tidak ditemukan');
    }

    await this.pregnancyProfilesService.findOne(
      assessment.pregnancy_profile_id,
      requester,
    );

    return assessment;
  }

  async findLatest(profileId: string, requester: CurrentUserData) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const cacheKey = this.latestCacheKey(profileId);
    const versionKey = this.latestCacheVersionKey(profileId);
    const cached = await this.cache.get<RiskAssessment>(cacheKey);

    if (cached) {
      return cached;
    }

    const cacheVersion = await this.cache.getVersion(versionKey);
    const assessment = await this.prisma.riskAssessment.findFirst({
      where: { pregnancy_profile_id: profileId },
      orderBy: { created_at: 'desc' },
    });

    if (assessment && cacheVersion !== null) {
      await this.cache.setIfVersion(
        cacheKey,
        assessment,
        RiskAssessmentsService.LATEST_CACHE_TTL_SECONDS,
        versionKey,
        cacheVersion,
      );
    }

    return assessment;
  }

  findBySymptomCheckin(symptomCheckinId: string) {
    return this.prisma.riskAssessment.findFirst({
      where: { symptom_checkin_id: symptomCheckinId },
      orderBy: { created_at: 'desc' },
    });
  }

  private async createAssessment(input: AssessmentInput) {
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: input.pregnancy_profile_id },
      select: { user: { select: { puskesmas_id: true } } },
    });

    if (!profile) {
      throw new NotFoundException('Profil kehamilan tidak ditemukan');
    }

    if (input.symptom_checkin_id) {
      const symptomCheckin = await this.prisma.symptomCheckin.findUnique({
        where: { id: input.symptom_checkin_id },
        select: { pregnancy_profile_id: true },
      });

      if (!symptomCheckin) {
        throw new NotFoundException('Symptom check-in tidak ditemukan');
      }

      if (symptomCheckin.pregnancy_profile_id !== input.pregnancy_profile_id) {
        throw new BadRequestException(
          'Symptom check-in tidak terkait dengan profil kehamilan',
        );
      }

      const existing = await this.findBySymptomCheckin(
        input.symptom_checkin_id,
      );

      if (existing) {
        await this.invalidateCaches(
          input.pregnancy_profile_id,
          profile.user.puskesmas_id,
        );
        return { assessment: existing, created: false };
      }
    }

    const cadenceDays = this.cadenceDays(input.risk_badge);
    const nextTriggerAt = this.addDays(new Date(), cadenceDays);
    let assessment: RiskAssessment;

    try {
      [assessment] = await this.prisma.$transaction([
        this.prisma.riskAssessment.create({
          data: {
            pregnancy_profile_id: input.pregnancy_profile_id,
            symptom_checkin_id: input.symptom_checkin_id,
            triage_score: input.triage_score,
            anemia_probability: input.anemia_probability,
            preeclampsia_probability: input.preeclampsia_probability,
            aggregate_score: input.aggregate_score,
            risk_badge: input.risk_badge,
            risk_factors: input.risk_factors,
            recommendation_text: input.recommendation_text,
          },
        }),
        this.prisma.reminder.updateMany({
          where: {
            pregnancy_profile_id: input.pregnancy_profile_id,
            reminder_type: ReminderType.ANC_CHECKUP,
            status: ReminderStatus.ACTIVE,
          },
          data: {
            cadence_days: cadenceDays,
            next_trigger_at: nextTriggerAt,
          },
        }),
      ]);
    } catch (error: unknown) {
      if (input.symptom_checkin_id && isUniqueConstraintError(error)) {
        const winner = await this.findBySymptomCheckin(
          input.symptom_checkin_id,
        );

        if (winner) {
          await this.invalidateCaches(
            input.pregnancy_profile_id,
            profile.user.puskesmas_id,
          );
          return { assessment: winner, created: false };
        }
      }

      throw error;
    }

    await this.invalidateCaches(
      input.pregnancy_profile_id,
      profile.user.puskesmas_id,
    );

    return { assessment, created: true };
  }

  private cadenceDays(riskBadge: RiskBadge) {
    switch (riskBadge) {
      case RiskBadge.MERAH:
        return 3;
      case RiskBadge.KUNING:
        return 7;
      case RiskBadge.HIJAU:
        return 14;
    }
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private invalidateCaches(profileId: string, puskesmasId: string | null) {
    const keys = [this.latestCacheKey(profileId)];

    if (puskesmasId) {
      keys.push(`bidan:patients:${puskesmasId}`);
    }

    return this.cache.invalidate(
      this.latestCacheVersionKey(profileId),
      ...keys,
    );
  }

  private latestCacheKey(profileId: string) {
    return `risk:latest:${profileId}`;
  }

  private latestCacheVersionKey(profileId: string) {
    return `risk:latest:version:${profileId}`;
  }
}
