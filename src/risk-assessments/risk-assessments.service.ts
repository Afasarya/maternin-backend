import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type RiskAssessment } from '../../generated/prisma/client.js';
import { RiskBadge } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import type { CompletedTriageAnalysisResponse } from '../common/services/ai-service.client.js';
import { AiServiceClient } from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { CreateRiskAssessmentInternalDto } from './dto/create-risk-assessment-internal.dto.js';
import {
  BidanConfirmAction,
  BidanConfirmDto,
} from './dto/bidan-confirm.dto.js';
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
  contract_version?: string;
  model_status?: string;
  model_version?: string | null;
  missing_features?: string[];
  disclaimer?: string;
  alert_delivery_status?: string;
  anemia_is_mock?: boolean;
  bidan_review_required?: boolean;
  screening_not_diagnosis?: boolean;
  evaluated_at?: string;
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
    private readonly remindersService: RemindersService,
    private readonly aiServiceClient: AiServiceClient,
  ) {}

  async predictTrend(
    profileId: string,
    requester: CurrentUserData,
    requestId: string,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const assessments = await this.prisma.riskAssessment.findMany({
      where: { pregnancy_profile_id: profileId },
      orderBy: { created_at: 'asc' },
      select: { aggregate_score: true, created_at: true },
    });

    if (assessments.length < 2) {
      throw new BadRequestException(
        'Prediksi tren membutuhkan minimal 2 risk assessment',
      );
    }

    return this.aiServiceClient.predictTrend(
      {
        pregnancy_profile_id: profileId,
        score_history: assessments.map((assessment) => ({
          aggregate_score: Number(assessment.aggregate_score),
          created_at: assessment.created_at.toISOString(),
        })),
      },
      requestId,
    );
  }

  createFromCallback(
    dto: CreateRiskAssessmentInternalDto,
  ): Promise<CreateRiskAssessmentResult> {
    return this.createAssessment(dto);
  }

  async createFromAiResponse(
    pregnancyProfileId: string,
    symptomCheckinId: string,
    aiResponse: CompletedTriageAnalysisResponse,
    replaceExisting = false,
  ) {
    const result = await this.createAssessment(
      {
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
        contract_version: aiResponse.contract_version,
        model_status: aiResponse.model_status,
        model_version: aiResponse.model_version,
        missing_features: aiResponse.missing_features,
        disclaimer: aiResponse.disclaimer,
        alert_delivery_status: aiResponse.alert_delivery_status,
        anemia_is_mock: aiResponse.anemia_is_mock,
        bidan_review_required: aiResponse.bidan_review_required,
        screening_not_diagnosis: aiResponse.screening_not_diagnosis,
        evaluated_at: aiResponse.evaluated_at,
      },
      replaceExisting,
    );

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

  async bidanConfirm(
    id: string,
    dto: BidanConfirmDto,
    requester: CurrentUserData,
    requestId: string,
  ) {
    const assessment = await this.findOne(id, requester);
    const aiResponse = await this.aiServiceClient.bidanConfirm(
      id,
      {
        bidan_id: requester.id,
        action: dto.action,
        ...(dto.new_risk_badge && { new_risk_badge: dto.new_risk_badge }),
        ...(dto.rationale && { rationale: dto.rationale }),
      },
      requestId,
    );

    return this.prisma.$transaction(async (transaction) => {
      const updated =
        dto.action === BidanConfirmAction.OVERRIDE_BADGE
          ? await transaction.riskAssessment.update({
              where: { id },
              data: {
                risk_badge: dto.new_risk_badge!,
                bidan_review_required: false,
              },
            })
          : await transaction.riskAssessment.update({
              where: { id },
              data: { bidan_review_required: false },
            });
      const audit = await transaction.triageBidanAudit.create({
        data: {
          risk_assessment_id: id,
          bidan_id: requester.id,
          action: dto.action,
          previous_risk_badge: assessment.risk_badge,
          new_risk_badge: dto.new_risk_badge,
          rationale: dto.rationale,
          ai_response: aiResponse as unknown as Prisma.InputJsonObject,
          request_id: requestId,
        },
      });
      return {
        assessment: updated,
        confirmation: aiResponse,
        audit_id: audit.id,
      };
    });
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

  private async createAssessment(
    input: AssessmentInput,
    replaceExisting = false,
  ) {
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
        if (replaceExisting) {
          const assessment = await this.prisma.$transaction(
            async (transaction) => {
              const updatedAssessment = await transaction.riskAssessment.update(
                {
                  where: { id: existing.id },
                  data: {
                    triage_score: input.triage_score,
                    anemia_probability: input.anemia_probability,
                    preeclampsia_probability: input.preeclampsia_probability,
                    aggregate_score: input.aggregate_score,
                    risk_badge: input.risk_badge,
                    risk_factors: input.risk_factors,
                    recommendation_text: input.recommendation_text,
                    contract_version: input.contract_version,
                    model_status: input.model_status,
                    model_version: input.model_version,
                    missing_features: input.missing_features,
                    disclaimer: input.disclaimer,
                    alert_delivery_status: input.alert_delivery_status,
                    anemia_is_mock: input.anemia_is_mock,
                    bidan_review_required: input.bidan_review_required,
                    screening_not_diagnosis: input.screening_not_diagnosis,
                    evaluated_at: input.evaluated_at
                      ? new Date(input.evaluated_at)
                      : undefined,
                    created_at: new Date(),
                  },
                },
              );

              await this.remindersService.updateCadenceOnNewAssessment(
                input.pregnancy_profile_id,
                input.risk_badge,
                transaction,
              );

              return updatedAssessment;
            },
          );

          await this.invalidateCaches(
            input.pregnancy_profile_id,
            profile.user.puskesmas_id,
          );

          return { assessment, created: false };
        }

        await this.invalidateCaches(
          input.pregnancy_profile_id,
          profile.user.puskesmas_id,
        );
        return { assessment: existing, created: false };
      }
    }

    let assessment: RiskAssessment;

    try {
      assessment = await this.prisma.$transaction(async (transaction) => {
        const createdAssessment = await transaction.riskAssessment.create({
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
            contract_version: input.contract_version,
            model_status: input.model_status,
            model_version: input.model_version,
            missing_features: input.missing_features,
            disclaimer: input.disclaimer,
            alert_delivery_status: input.alert_delivery_status,
            anemia_is_mock: input.anemia_is_mock,
            bidan_review_required: input.bidan_review_required,
            screening_not_diagnosis: input.screening_not_diagnosis,
            evaluated_at: input.evaluated_at
              ? new Date(input.evaluated_at)
              : undefined,
          },
        });

        await this.remindersService.updateCadenceOnNewAssessment(
          input.pregnancy_profile_id,
          input.risk_badge,
          transaction,
        );

        return createdAssessment;
      });
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
