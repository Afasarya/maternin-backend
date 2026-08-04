import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Queue } from 'bullmq';
import { Prisma, type SyncQueue } from '../../generated/prisma/client.js';
import { AncRecordsService } from '../anc-records/anc-records.service.js';
import { CreateAncRecordDto } from '../anc-records/dto/create-anc-record.dto.js';
import { SyncPayloadType, SyncStatus } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSymptomCheckinDto } from '../symptom-checkins/dto/create-symptom-checkin.dto.js';
import { SymptomCheckinsService } from '../symptom-checkins/symptom-checkins.service.js';
import { SyncBatchDto, SyncRecordDto } from './dto/sync-batch.dto.js';
import { SYNC_PROCESSING_QUEUE, SYNC_RETRY_JOB } from './sync.constants.js';

interface PrismaKnownRequestError {
  code: string;
}

interface ReservedRecord {
  queueRecord: SyncQueue;
  action: 'process' | 'skip';
  queueCreated: boolean;
  replaceExisting: boolean;
}

interface ProcessedSyncResult {
  client_uuid: string;
  status: 'processed';
  server_id: string;
}

interface SkippedSyncResult {
  client_uuid: string;
  status: 'skipped';
  reason: 'duplicate';
}

interface FailedSyncResult {
  client_uuid: string;
  status: 'failed';
  reason: string;
}

export type SyncRecordResult =
  ProcessedSyncResult | SkippedSyncResult | FailedSyncResult;

export interface SyncRetryJobData {
  client_uuid: string;
  requester: CurrentUserData;
  request_id: string;
}

export interface SyncBatchResult {
  created: boolean;
  data: {
    total_received: number;
    processed: number;
    skipped: number;
    failed: number;
    results: SyncRecordResult[];
  };
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
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ancRecordsService: AncRecordsService,
    private readonly symptomCheckinsService: SymptomCheckinsService,
    @InjectQueue(SYNC_PROCESSING_QUEUE)
    private readonly syncQueue: Queue<SyncRetryJobData>,
  ) {}

  async processBatch(
    dto: SyncBatchDto,
    requester: CurrentUserData,
    requestId: string,
  ): Promise<SyncBatchResult> {
    const results: SyncRecordResult[] = [];
    let createdQueueCount = 0;

    for (const record of dto.records) {
      let reserved: ReservedRecord;

      try {
        reserved = await this.reserveRecord(dto.device_uuid, record);
      } catch (error: unknown) {
        results.push({
          client_uuid: record.client_uuid,
          status: 'failed',
          reason: this.safeFailureReason(error),
        });
        continue;
      }

      if (reserved.queueCreated) {
        createdQueueCount += 1;
      }

      if (reserved.action === 'skip') {
        results.push({
          client_uuid: record.client_uuid,
          status: 'skipped',
          reason: 'duplicate',
        });
        continue;
      }

      try {
        const serverId = await this.processTrackedRecord(
          reserved.queueRecord,
          requester,
          requestId,
          reserved.replaceExisting,
        );
        results.push({
          client_uuid: record.client_uuid,
          status: 'processed',
          server_id: serverId,
        });
      } catch (error: unknown) {
        await this.markFailed(
          record.client_uuid,
          reserved.queueRecord.client_created_at,
        );
        results.push({
          client_uuid: record.client_uuid,
          status: 'failed',
          reason: this.safeFailureReason(error),
        });

        if (!(error instanceof HttpException)) {
          await this.enqueueRetry(record.client_uuid, requester, requestId);
        }
      }
    }

    return {
      created: createdQueueCount > 0,
      data: {
        total_received: dto.records.length,
        processed: results.filter(({ status }) => status === 'processed')
          .length,
        skipped: results.filter(({ status }) => status === 'skipped').length,
        failed: results.filter(({ status }) => status === 'failed').length,
        results,
      },
    };
  }

  async retryFailedRecord(
    clientUuid: string,
    requester: CurrentUserData,
    requestId: string,
  ) {
    const queueRecord = await this.prisma.syncQueue.findUnique({
      where: { client_uuid: clientUuid },
    });

    if (!queueRecord) {
      throw new Error(`Sync queue ${clientUuid} tidak ditemukan`);
    }

    if (String(queueRecord.status) === 'processed') {
      return { client_uuid: clientUuid, status: SyncStatus.PROCESSED };
    }

    try {
      const serverId = await this.processTrackedRecord(
        queueRecord,
        requester,
        requestId,
        true,
      );

      return {
        client_uuid: clientUuid,
        status: SyncStatus.PROCESSED,
        server_id: serverId,
      };
    } catch (error: unknown) {
      await this.markFailed(clientUuid, queueRecord.client_created_at);
      throw error;
    }
  }

  async getDeviceStatus(deviceUuid: string) {
    const [groups, latest] = await Promise.all([
      this.prisma.syncQueue.groupBy({
        by: ['status'],
        where: { device_uuid: deviceUuid },
        _count: { _all: true },
      }),
      this.prisma.syncQueue.findFirst({
        where: { device_uuid: deviceUuid },
        orderBy: { client_created_at: 'desc' },
        select: {
          client_uuid: true,
          payload_type: true,
          client_created_at: true,
          synced_at: true,
          status: true,
        },
      }),
    ]);
    const counts: Record<SyncStatus, number> = {
      [SyncStatus.PENDING]: 0,
      [SyncStatus.PROCESSED]: 0,
      [SyncStatus.FAILED]: 0,
    };

    for (const group of groups) {
      counts[group.status] = group._count._all;
    }

    return {
      device_uuid: deviceUuid,
      total: counts.pending + counts.processed + counts.failed,
      processed: counts.processed,
      pending: counts.pending,
      failed: counts.failed,
      last_sync: latest,
    };
  }

  private async reserveRecord(
    deviceUuid: string,
    record: SyncRecordDto,
  ): Promise<ReservedRecord> {
    const existing = await this.prisma.syncQueue.findUnique({
      where: { client_uuid: record.client_uuid },
    });

    if (existing) {
      return this.resolveExistingRecord(existing, record, deviceUuid);
    }

    try {
      const queueRecord = await this.prisma.syncQueue.create({
        data: {
          device_uuid: deviceUuid,
          payload_type: record.payload_type,
          payload: record.payload as Prisma.InputJsonObject,
          client_created_at: new Date(record.client_created_at),
          status: SyncStatus.PENDING,
          client_uuid: record.client_uuid,
        },
      });

      return {
        queueRecord,
        action: 'process',
        queueCreated: true,
        replaceExisting: false,
      };
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const winner = await this.prisma.syncQueue.findUnique({
        where: { client_uuid: record.client_uuid },
      });

      if (!winner) {
        throw error;
      }

      return this.resolveExistingRecord(winner, record, deviceUuid);
    }
  }

  private async resolveExistingRecord(
    existing: SyncQueue,
    incoming: SyncRecordDto,
    deviceUuid: string,
  ): Promise<ReservedRecord> {
    if (String(existing.payload_type) !== String(incoming.payload_type)) {
      throw new BadRequestException(
        'client_uuid tidak boleh digunakan untuk payload_type berbeda',
      );
    }

    const incomingCreatedAt = new Date(incoming.client_created_at);
    const updated = await this.prisma.syncQueue.updateMany({
      where: {
        client_uuid: incoming.client_uuid,
        client_created_at: { lt: incomingCreatedAt },
      },
      data: {
        device_uuid: deviceUuid,
        payload: incoming.payload as Prisma.InputJsonObject,
        client_created_at: incomingCreatedAt,
        synced_at: null,
        status: SyncStatus.PENDING,
      },
    });

    if (updated.count === 0) {
      return {
        queueRecord: existing,
        action: 'skip',
        queueCreated: false,
        replaceExisting: false,
      };
    }

    const queueRecord = await this.prisma.syncQueue.findUniqueOrThrow({
      where: { client_uuid: incoming.client_uuid },
    });

    return {
      queueRecord,
      action: 'process',
      queueCreated: false,
      replaceExisting: true,
    };
  }

  private async processTrackedRecord(
    initialQueueRecord: SyncQueue,
    requester: CurrentUserData,
    requestId: string,
    replaceExisting: boolean,
  ) {
    let queueRecord = initialQueueRecord;
    let shouldReplace = replaceExisting;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const serverId = await this.dispatchRecord(
        queueRecord,
        requester,
        requestId,
        shouldReplace,
      );
      const marked = await this.prisma.syncQueue.updateMany({
        where: {
          client_uuid: queueRecord.client_uuid,
          client_created_at: queueRecord.client_created_at,
        },
        data: {
          status: SyncStatus.PROCESSED,
          synced_at: new Date(),
        },
      });

      if (marked.count === 1) {
        return serverId;
      }

      queueRecord = await this.prisma.syncQueue.findUniqueOrThrow({
        where: { client_uuid: queueRecord.client_uuid },
      });
      shouldReplace = true;
    }

    throw new Error('Payload sync terus berubah selama diproses');
  }

  private async dispatchRecord(
    queueRecord: SyncQueue,
    requester: CurrentUserData,
    requestId: string,
    replaceExisting: boolean,
  ) {
    const payload = this.asPayloadObject(queueRecord.payload);

    if (String(queueRecord.payload_type) === 'anc_record') {
      const dto = plainToInstance(CreateAncRecordDto, {
        ...payload,
        client_uuid: queueRecord.client_uuid,
        recorded_at:
          payload.recorded_at ?? queueRecord.client_created_at.toISOString(),
      });
      await this.assertValidPayload(dto, 'anc_record');
      const result = await this.ancRecordsService.create(dto, requester, {
        replaceExisting,
      });
      return result.record.id;
    }

    const dto = plainToInstance(CreateSymptomCheckinDto, {
      ...payload,
      client_uuid: queueRecord.client_uuid,
    });
    await this.assertValidPayload(dto, 'symptom_checkin');
    const result = await this.symptomCheckinsService.create(
      dto,
      requester,
      requestId,
      {
        replaceExisting,
        createdAt: queueRecord.client_created_at,
      },
    );

    return result.data.checkin.id;
  }

  private asPayloadObject(payload: Prisma.JsonValue) {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new BadRequestException('payload harus berupa object');
    }

    return payload as Record<string, unknown>;
  }

  private async assertValidPayload(
    dto: CreateAncRecordDto | CreateSymptomCheckinDto,
    payloadType: `${SyncPayloadType}`,
  ) {
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException(`Payload ${payloadType} tidak valid`);
    }
  }

  private async markFailed(clientUuid: string, clientCreatedAt: Date) {
    try {
      await this.prisma.syncQueue.updateMany({
        where: {
          client_uuid: clientUuid,
          client_created_at: clientCreatedAt,
        },
        data: { status: SyncStatus.FAILED, synced_at: new Date() },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Status gagal sync ${clientUuid} tidak dapat disimpan`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async enqueueRetry(
    clientUuid: string,
    requester: CurrentUserData,
    requestId: string,
  ) {
    try {
      await this.syncQueue.add(
        SYNC_RETRY_JOB,
        {
          client_uuid: clientUuid,
          requester,
          request_id: requestId,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          jobId: clientUuid,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch (error: unknown) {
      this.logger.error(
        `Gagal memasukkan sync ${clientUuid} ke antrean retry`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private safeFailureReason(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (typeof response === 'object' && response !== null) {
        const message = (response as { message?: unknown }).message;

        if (typeof message === 'string') {
          return message;
        }
      }
    }

    return 'Gagal memproses record';
  }
}
