import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  POSTPARTUM_RETRY_JOB,
  POSTPARTUM_RETRY_QUEUE,
} from './postpartum.constants.js';
import {
  PostpartumService,
  type PostpartumRetryJobData,
} from './postpartum.service.js';

@Processor(POSTPARTUM_RETRY_QUEUE)
export class PostpartumRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(PostpartumRetryProcessor.name);

  constructor(private readonly postpartumService: PostpartumService) {
    super();
  }

  async process(job: Job<PostpartumRetryJobData>) {
    if (job.name !== POSTPARTUM_RETRY_JOB) {
      throw new Error(`Job postpartum tidak dikenal: ${job.name}`);
    }

    return this.postpartumService.processPostpartumEvaluation(
      job.data.postpartum_log_id,
      job.data.request_id,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PostpartumRetryJobData> | undefined, error: Error) {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    this.logger.error(
      `Evaluasi postpartum gagal permanen untuk log ${job.data.postpartum_log_id}`,
      error.stack,
    );
  }
}
