import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { FonnteClient } from './fonnte.client.js';
import {
  NOTIFICATIONS_QUEUE,
  SEND_WHATSAPP_NOTIFICATION_JOB,
} from './notifications.constants.js';
import {
  NotificationsService,
  type SendWhatsAppNotificationJobData,
} from './notifications.service.js';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly fonnteClient: FonnteClient,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<SendWhatsAppNotificationJobData>) {
    if (job.name !== SEND_WHATSAPP_NOTIFICATION_JOB) {
      throw new Error(`Job notifikasi tidak dikenal: ${job.name}`);
    }

    const result = await this.fonnteClient.sendWhatsApp(
      job.data.phone_number,
      job.data.message,
    );

    if (!result.success) {
      throw new Error('Pengiriman WhatsApp gagal');
    }

    return this.notificationsService.markNotificationSent(
      job.data.notification_log_id,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SendWhatsAppNotificationJobData> | undefined) {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    try {
      await this.notificationsService.markNotificationFailed(
        job.data.notification_log_id,
      );
      this.logger.error(
        `Notifikasi ${job.data.notification_log_id} gagal setelah seluruh percobaan`,
      );
    } catch {
      this.logger.error(
        `Status gagal notifikasi ${job.data.notification_log_id} tidak dapat disimpan`,
      );
    }
  }
}
