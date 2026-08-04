import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SYNC_PROCESSING_QUEUE, SYNC_RETRY_JOB } from './sync.constants.js';
import { SyncService, type SyncRetryJobData } from './sync.service.js';

@Processor(SYNC_PROCESSING_QUEUE)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(private readonly syncService: SyncService) {
    super();
  }

  async process(job: Job<SyncRetryJobData>) {
    if (job.name !== SYNC_RETRY_JOB) {
      throw new Error(`Job sync tidak dikenal: ${job.name}`);
    }

    return this.syncService.retryFailedRecord(
      job.data.client_uuid,
      job.data.requester,
      job.data.request_id,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SyncRetryJobData> | undefined, error: Error) {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    this.logger.error(
      `Sync ${job.data.client_uuid} gagal setelah seluruh percobaan`,
      error.stack,
    );
  }
}
