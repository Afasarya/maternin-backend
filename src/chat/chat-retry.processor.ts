import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CHAT_RETRY_JOB, CHAT_RETRY_QUEUE } from './chat.constants.js';
import { ChatService, type ChatRetryJobData } from './chat.service.js';

@Processor(CHAT_RETRY_QUEUE)
export class ChatRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatRetryProcessor.name);

  constructor(private readonly chatService: ChatService) {
    super();
  }

  async process(job: Job<ChatRetryJobData>) {
    if (job.name !== CHAT_RETRY_JOB) {
      throw new Error(`Job chat tidak dikenal: ${job.name}`);
    }

    return this.chatService.processReply(
      job.data.user_message_id,
      job.data.request_id,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ChatRetryJobData> | undefined, error: Error) {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    this.logger.error(
      `Reply chat gagal permanen untuk pesan ${job.data.user_message_id}`,
      error.stack,
    );
  }
}
