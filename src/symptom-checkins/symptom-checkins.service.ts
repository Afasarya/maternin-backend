import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client.js';
import type { SymptomCheckin } from '../../generated/prisma/client.js';
import { AncRecordsService } from '../anc-records/anc-records.service.js';
import { SymptomSource, UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { AiServiceUnavailableException } from '../common/exceptions/ai-service-unavailable.exception.js';
import { AiServiceClient } from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RiskAssessmentsService } from '../risk-assessments/risk-assessments.service.js';
import { CreateSymptomCheckinDto } from './dto/create-symptom-checkin.dto.js';
import {
  TRIAGE_RETRY_JOB,
  TRIAGE_RETRY_QUEUE,
} from './symptom-checkins.constants.js';

interface Pagination {
  limit: number;
  offset: number;
}

export interface CreateSymptomCheckinOptions {
  replaceExisting?: boolean;
  createdAt?: Date;
}

export interface TriageRetryJobData {
  checkin_id: string;
  request_id: string;
  replace_existing_assessment?: boolean;
}

interface PrismaKnownRequestError {
  code: string;
  clientVersion: string;
}

const isUniqueConstraintError = (
  error: unknown,
): error is PrismaKnownRequestError => {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & Partial<PrismaKnownRequestError>;

  return (
    candidate.code === 'P2002' && typeof candidate.clientVersion === 'string'
  );
};

@Injectable()
export class SymptomCheckinsService {
  private readonly logger = new Logger(SymptomCheckinsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly ancRecordsService: AncRecordsService,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
    private readonly riskAssessmentsService: RiskAssessmentsService,
    @InjectQueue(TRIAGE_RETRY_QUEUE)
    private readonly triageRetryQueue: Queue<TriageRetryJobData>,
  ) {}

  async create(
    dto: CreateSymptomCheckinDto,
    requester: CurrentUserData,
    requestId: string,
    options: CreateSymptomCheckinOptions = {},
  ) {
    await this.assertCreateAccess(dto.pregnancy_profile_id, requester);

    const existing = dto.client_uuid
      ? await this.findByClientUuid(dto.client_uuid)
      : null;

    if (existing) {
      this.assertIdempotencyProfile(
        existing.pregnancy_profile_id,
        dto.pregnancy_profile_id,
      );

      if (options.replaceExisting) {
        const updated = await this.replaceExistingCheckin(
          existing.id,
          dto,
          requester,
          options.createdAt,
        );

        return this.analyzeCheckin(updated, requestId, false, true);
      }

      return {
        created: false,
        data: await this.buildExistingResult(existing, requestId),
      };
    }

    let checkin: SymptomCheckin;

    try {
      checkin = await this.prisma.symptomCheckin.create({
        data: {
          pregnancy_profile_id: dto.pregnancy_profile_id,
          checkin_type: dto.checkin_type,
          answers: dto.answers as Prisma.InputJsonObject,
          conjunctiva_image_url: dto.conjunctiva_image_url,
          source: this.resolveSource(requester.role),
          client_uuid: dto.client_uuid,
          ...(options.createdAt && { created_at: options.createdAt }),
        },
      });
    } catch (error: unknown) {
      if (dto.client_uuid && isUniqueConstraintError(error)) {
        const winner = await this.findByClientUuid(dto.client_uuid);

        if (winner) {
          this.assertIdempotencyProfile(
            winner.pregnancy_profile_id,
            dto.pregnancy_profile_id,
          );

          if (options.replaceExisting) {
            const updated = await this.replaceExistingCheckin(
              winner.id,
              dto,
              requester,
              options.createdAt,
            );

            return this.analyzeCheckin(updated, requestId, false, true);
          }

          return {
            created: false,
            data: await this.buildExistingResult(winner, requestId),
          };
        }
      }

      throw error;
    }

    return this.analyzeCheckin(checkin, requestId, true, false);
  }

  async processTriageAnalysis(
    checkinId: string,
    requestId: string,
    replaceExistingAssessment = false,
  ) {
    const existingAssessment = replaceExistingAssessment
      ? null
      : await this.riskAssessmentsService.findBySymptomCheckin(checkinId);

    if (existingAssessment) {
      return existingAssessment;
    }

    const checkin = await this.prisma.symptomCheckin.findUnique({
      where: { id: checkinId },
    });

    if (!checkin) {
      throw new NotFoundException('Symptom check-in tidak ditemukan');
    }

    const [profile, latestAnc] = await Promise.all([
      this.pregnancyProfilesService.findOne(checkin.pregnancy_profile_id),
      this.ancRecordsService.findLatest(checkin.pregnancy_profile_id),
    ]);
    const aiResponse = await this.aiServiceClient.analyzeTriageSymptoms(
      {
        pregnancy_profile_id: checkin.pregnancy_profile_id,
        symptom_checkin_id: checkin.id,
        answers: checkin.answers as Record<string, unknown>,
        conjunctiva_image_url: checkin.conjunctiva_image_url,
        latest_anc: latestAnc
          ? {
              systolic: latestAnc.systolic,
              diastolic: latestAnc.diastolic,
              protein_urine: latestAnc.protein_urine,
            }
          : null,
        has_preeclampsia_history: profile.had_preeclampsia_history,
      },
      requestId,
    );

    if (replaceExistingAssessment) {
      return this.riskAssessmentsService.createFromAiResponse(
        checkin.pregnancy_profile_id,
        checkin.id,
        aiResponse,
        true,
      );
    }

    return this.riskAssessmentsService.createFromAiResponse(
      checkin.pregnancy_profile_id,
      checkin.id,
      aiResponse,
    );
  }

  async findByProfile(
    profileId: string,
    pagination: Pagination,
    requester: CurrentUserData,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const where = { pregnancy_profile_id: profileId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.symptomCheckin.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.symptomCheckin.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester: CurrentUserData) {
    const checkin = await this.prisma.symptomCheckin.findUnique({
      where: { id },
    });

    if (!checkin) {
      throw new NotFoundException('Symptom check-in tidak ditemukan');
    }

    await this.pregnancyProfilesService.findOne(
      checkin.pregnancy_profile_id,
      requester,
    );

    return checkin;
  }

  private async buildExistingResult(
    checkin: SymptomCheckin,
    requestId: string,
  ) {
    const assessment = await this.riskAssessmentsService.findBySymptomCheckin(
      checkin.id,
    );

    if (assessment) {
      return { checkin, risk_assessment: assessment };
    }

    await this.enqueueTriageRetry(checkin.id, requestId);
    return this.processingResult(checkin);
  }

  private async analyzeCheckin(
    checkin: SymptomCheckin,
    requestId: string,
    created: boolean,
    replaceExistingAssessment: boolean,
  ) {
    try {
      const riskAssessment = await this.processTriageAnalysis(
        checkin.id,
        requestId,
        replaceExistingAssessment,
      );

      return {
        created,
        data: { checkin, risk_assessment: riskAssessment },
      };
    } catch (error: unknown) {
      if (!(error instanceof AiServiceUnavailableException)) {
        throw error;
      }

      await this.enqueueTriageRetry(
        checkin.id,
        requestId,
        replaceExistingAssessment,
      );
      return {
        created,
        data: this.processingResult(checkin),
      };
    }
  }

  private replaceExistingCheckin(
    id: string,
    dto: CreateSymptomCheckinDto,
    requester: CurrentUserData,
    createdAt?: Date,
  ) {
    return this.prisma.symptomCheckin.update({
      where: { id },
      data: {
        checkin_type: dto.checkin_type,
        answers: dto.answers as Prisma.InputJsonObject,
        conjunctiva_image_url: dto.conjunctiva_image_url ?? null,
        source: this.resolveSource(requester.role),
        ...(createdAt && { created_at: createdAt }),
      },
    });
  }

  private processingResult(checkin: SymptomCheckin) {
    return {
      checkin,
      status: 'processing' as const,
      message: 'Sedang diproses',
    };
  }

  private findByClientUuid(clientUuid: string) {
    return this.prisma.symptomCheckin.findFirst({
      where: { client_uuid: clientUuid },
    });
  }

  private async enqueueTriageRetry(
    checkinId: string,
    requestId: string,
    replaceExistingAssessment = false,
  ) {
    try {
      await this.triageRetryQueue.add(
        TRIAGE_RETRY_JOB,
        {
          checkin_id: checkinId,
          request_id: requestId,
          ...(replaceExistingAssessment && {
            replace_existing_assessment: true,
          }),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          jobId: checkinId,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch (error: unknown) {
      this.logger.error(
        `Gagal memasukkan check-in ${checkinId} ke antrean retry`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async assertCreateAccess(
    profileId: string,
    requester: CurrentUserData,
  ) {
    const profile = await this.pregnancyProfilesService.findOne(profileId);

    if (
      requester.role === UserRole.IBU_HAMIL &&
      profile.user_id === requester.id
    ) {
      return;
    }

    if (
      requester.role === UserRole.KADER &&
      requester.puskesmas_id &&
      profile.user.puskesmas_id === requester.puskesmas_id
    ) {
      return;
    }

    throw new ForbiddenException(
      'Tidak memiliki akses membuat symptom check-in',
    );
  }

  private resolveSource(role: UserRole) {
    if (role === UserRole.IBU_HAMIL) {
      return SymptomSource.SELF;
    }

    if (role === UserRole.KADER) {
      return SymptomSource.KADER_OFFLINE;
    }

    throw new ForbiddenException('Role tidak dapat membuat symptom check-in');
  }

  private assertIdempotencyProfile(
    existingProfileId: string,
    requestedProfileId: string,
  ) {
    if (existingProfileId !== requestedProfileId) {
      throw new ConflictException(
        'client_uuid sudah digunakan untuk profil kehamilan lain',
      );
    }
  }
}
