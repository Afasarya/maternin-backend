import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { PostpartumLog, Prisma } from '../../generated/prisma/client.js';
import { UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { AiServiceUnavailableException } from '../common/exceptions/ai-service-unavailable.exception.js';
import {
  AiServiceClient,
  type PostpartumEvaluationResponse,
} from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { CreatePostpartumLogDto } from './dto/create-postpartum-log.dto.js';
import { PostpartumFlagCallbackDto } from './dto/postpartum-flag-callback.dto.js';
import { PostpartumLogSort } from './dto/query-postpartum-logs.dto.js';
import {
  POSTPARTUM_RETRY_JOB,
  POSTPARTUM_RETRY_QUEUE,
} from './postpartum.constants.js';

interface Pagination {
  limit: number;
  offset: number;
  sort: PostpartumLogSort;
}

interface PrismaKnownRequestError {
  code: string;
  clientVersion: string;
}

export interface PostpartumRetryJobData {
  postpartum_log_id: string;
  request_id: string;
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
export class PostpartumService {
  private readonly logger = new Logger(PostpartumService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
    private readonly remindersService: RemindersService,
    @InjectQueue(POSTPARTUM_RETRY_QUEUE)
    private readonly postpartumRetryQueue: Queue<PostpartumRetryJobData>,
  ) {}

  async create(
    dto: CreatePostpartumLogDto,
    requester: CurrentUserData,
    requestId: string,
  ) {
    const profile = await this.pregnancyProfilesService.findOne(
      dto.pregnancy_profile_id,
    );
    this.assertCreateAccess(profile, requester);

    const existing = dto.client_uuid
      ? await this.findByClientUuid(dto.client_uuid)
      : null;

    if (existing) {
      this.assertIdempotencyProfile(
        existing.pregnancy_profile_id,
        dto.pregnancy_profile_id,
      );
      return {
        created: false,
        data: await this.buildExistingResult(existing, requestId),
      };
    }

    if (profile.status !== 'nifas') {
      throw new BadRequestException('Profil harus berstatus nifas');
    }

    let log: PostpartumLog;

    try {
      log = await this.prisma.$transaction(async (transaction) => {
        const createdLog = await transaction.postpartumLog.create({
          data: {
            pregnancy_profile_id: dto.pregnancy_profile_id,
            day_number: dto.day_number,
            bleeding_level: dto.bleeding_level,
            fever: dto.fever,
            wound_condition: dto.wound_condition,
            headache_severe: dto.headache_severe,
            mood_flag: dto.mood_flag,
            client_uuid: dto.client_uuid,
          },
        });

        await this.remindersService.createPostpartumReminder(
          dto.pregnancy_profile_id,
          dto.day_number,
          transaction,
        );

        return createdLog;
      });
    } catch (error: unknown) {
      if (dto.client_uuid && isUniqueConstraintError(error)) {
        const winner = await this.findByClientUuid(dto.client_uuid);

        if (winner) {
          this.assertIdempotencyProfile(
            winner.pregnancy_profile_id,
            dto.pregnancy_profile_id,
          );
          return {
            created: false,
            data: await this.buildExistingResult(winner, requestId),
          };
        }
      }

      throw error;
    }

    try {
      const evaluation = await this.processPostpartumEvaluation(
        log.id,
        requestId,
      );
      const evaluatedLog = await this.findLogOrThrow(log.id);

      return {
        created: true,
        data: { log: evaluatedLog, evaluation },
      };
    } catch (error: unknown) {
      if (!(error instanceof AiServiceUnavailableException)) {
        throw error;
      }

      await this.enqueueEvaluationRetry(log.id, requestId);
      return {
        created: true,
        data: this.processingResult(log),
      };
    }
  }

  async processPostpartumEvaluation(logId: string, requestId: string) {
    const log = await this.findLogOrThrow(logId);

    if (log.evaluated_at) {
      return this.evaluationFromLog(log);
    }

    const profile = await this.pregnancyProfilesService.findOne(
      log.pregnancy_profile_id,
    );
    const evaluation = await this.aiServiceClient.evaluatePostpartum(
      {
        pregnancy_profile_id: log.pregnancy_profile_id,
        postpartum_log: {
          id: log.id,
          day_number: log.day_number,
          bleeding_level: log.bleeding_level,
          fever: log.fever,
          wound_condition: log.wound_condition,
          headache_severe: log.headache_severe,
          mood_flag: log.mood_flag,
        },
        had_preeclampsia_history: profile.had_preeclampsia_history,
      },
      requestId,
    );

    await this.prisma.postpartumLog.update({
      where: { id: log.id },
      data: {
        red_flag_triggered: evaluation.red_flag_triggered,
        evaluation_reason: evaluation.reason,
        mental_health_flag: evaluation.mental_health_flag,
        evaluated_at: new Date(),
      },
    });

    return evaluation;
  }

  async updateFlags(dto: PostpartumFlagCallbackDto) {
    const log = await this.findLogOrThrow(dto.postpartum_log_id);

    if (log.pregnancy_profile_id !== dto.pregnancy_profile_id) {
      throw new BadRequestException(
        'Postpartum log tidak terkait dengan profil kehamilan',
      );
    }

    return this.prisma.postpartumLog.update({
      where: { id: log.id },
      data: {
        red_flag_triggered: dto.red_flag_triggered,
        ...(dto.reason !== undefined && { evaluation_reason: dto.reason }),
        ...(dto.mental_health_flag !== undefined && {
          mental_health_flag: dto.mental_health_flag,
        }),
        evaluated_at: new Date(),
      },
    });
  }

  async findByProfile(
    profileId: string,
    pagination: Pagination,
    requester: CurrentUserData,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const where = { pregnancy_profile_id: profileId };
    const orderBy: Prisma.PostpartumLogOrderByWithRelationInput[] =
      pagination.sort === PostpartumLogSort.CREATED_DESC
        ? [{ created_at: 'desc' }]
        : [{ day_number: 'asc' }, { created_at: 'asc' }];
    const [data, total] = await this.prisma.$transaction([
      this.prisma.postpartumLog.findMany({
        where,
        orderBy,
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.postpartumLog.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester: CurrentUserData) {
    const log = await this.findLogOrThrow(id);

    await this.pregnancyProfilesService.findOne(
      log.pregnancy_profile_id,
      requester,
    );

    return log;
  }

  private async buildExistingResult(log: PostpartumLog, requestId: string) {
    if (log.evaluated_at) {
      return { log, evaluation: this.evaluationFromLog(log) };
    }

    await this.enqueueEvaluationRetry(log.id, requestId);
    return this.processingResult(log);
  }

  private processingResult(log: PostpartumLog) {
    return {
      log,
      status: 'processing' as const,
      message: 'Sedang diproses',
    };
  }

  private evaluationFromLog(log: PostpartumLog): PostpartumEvaluationResponse {
    return {
      red_flag_triggered: log.red_flag_triggered,
      reason: log.evaluation_reason ?? '',
      mental_health_flag: log.mental_health_flag ?? false,
    };
  }

  private findByClientUuid(clientUuid: string) {
    return this.prisma.postpartumLog.findFirst({
      where: { client_uuid: clientUuid },
    });
  }

  private async findLogOrThrow(id: string) {
    const log = await this.prisma.postpartumLog.findUnique({ where: { id } });

    if (!log) {
      throw new NotFoundException('Postpartum log tidak ditemukan');
    }

    return log;
  }

  private async enqueueEvaluationRetry(logId: string, requestId: string) {
    try {
      await this.postpartumRetryQueue.add(
        POSTPARTUM_RETRY_JOB,
        { postpartum_log_id: logId, request_id: requestId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          jobId: logId,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch (error: unknown) {
      this.logger.error(
        `Gagal memasukkan postpartum log ${logId} ke antrean retry`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private assertCreateAccess(
    profile: {
      user_id: string;
      user: { puskesmas_id: string | null };
    },
    requester: CurrentUserData,
  ) {
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

    throw new ForbiddenException('Tidak memiliki akses membuat postpartum log');
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
