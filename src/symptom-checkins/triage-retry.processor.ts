import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  TRIAGE_RETRY_JOB,
  TRIAGE_RETRY_QUEUE,
} from './symptom-checkins.constants.js';
import type { TriageRetryJobData } from './symptom-checkins.service.js';
import { SymptomCheckinsService } from './symptom-checkins.service.js';

@Processor(TRIAGE_RETRY_QUEUE)
export class TriageRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(TriageRetryProcessor.name);

  constructor(private readonly symptomCheckinsService: SymptomCheckinsService) {
    super();
  }

  async process(job: Job<TriageRetryJobData>) {
    if (job.name !== TRIAGE_RETRY_JOB) {
      throw new Error(`Job triage tidak dikenal: ${job.name}`);
    }

    return this.symptomCheckinsService.processTriageAnalysis(
      job.data.checkin_id,
      job.data.request_id,
      job.data.replace_existing_assessment,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<TriageRetryJobData> | undefined, error: Error) {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    this.logger.error(
      `Analisis triage gagal permanen untuk check-in ${job.data.checkin_id}`,
      error.stack,
    );
  }
}
