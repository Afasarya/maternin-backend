import type { Job } from 'bullmq';
import { FonnteClient } from './fonnte.client.js';
import { SEND_WHATSAPP_NOTIFICATION_JOB } from './notifications.constants.js';
import { NotificationsProcessor } from './notifications.processor.js';
import {
  NotificationsService,
  type SendWhatsAppNotificationJobData,
} from './notifications.service.js';

describe('NotificationsProcessor', () => {
  const jobData: SendWhatsAppNotificationJobData = {
    notification_log_id: '11111111-1111-4111-8111-111111111111',
    phone_number: '+6281410000001',
    message: 'Pesan pengingat',
  };
  const fonnteClient = { sendWhatsApp: jest.fn() };
  const notificationsService = {
    markNotificationSent: jest.fn(),
    markNotificationFailed: jest.fn(),
  };
  let processor: NotificationsProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new NotificationsProcessor(
      fonnteClient as unknown as FonnteClient,
      notificationsService as unknown as NotificationsService,
    );
    notificationsService.markNotificationSent.mockResolvedValue({
      id: jobData.notification_log_id,
      status: 'sent',
    });
    notificationsService.markNotificationFailed.mockResolvedValue({
      id: jobData.notification_log_id,
      status: 'failed',
    });
  });

  it('allows BullMQ retries twice then marks sent on the third attempt', async () => {
    fonnteClient.sendWhatsApp
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true });
    const job = {
      name: SEND_WHATSAPP_NOTIFICATION_JOB,
      data: jobData,
    } as Job<SendWhatsAppNotificationJobData>;

    await expect(processor.process(job)).rejects.toThrow(
      'Pengiriman WhatsApp gagal',
    );
    await expect(processor.process(job)).rejects.toThrow(
      'Pengiriman WhatsApp gagal',
    );
    await expect(processor.process(job)).resolves.toMatchObject({
      status: 'sent',
    });
    expect(fonnteClient.sendWhatsApp).toHaveBeenCalledTimes(3);
    expect(notificationsService.markNotificationSent).toHaveBeenCalledTimes(1);
    expect(notificationsService.markNotificationFailed).not.toHaveBeenCalled();
  });

  it('marks failed only after the final BullMQ attempt', async () => {
    fonnteClient.sendWhatsApp.mockResolvedValue({ success: false });
    const job = {
      name: SEND_WHATSAPP_NOTIFICATION_JOB,
      data: jobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as Job<SendWhatsAppNotificationJobData>;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(processor.process(job)).rejects.toThrow(
        'Pengiriman WhatsApp gagal',
      );
      job.attemptsMade = attempt;
      await processor.onFailed(job);

      if (attempt < 3) {
        expect(
          notificationsService.markNotificationFailed,
        ).not.toHaveBeenCalled();
      }
    }

    expect(fonnteClient.sendWhatsApp).toHaveBeenCalledTimes(3);
    expect(notificationsService.markNotificationFailed).toHaveBeenCalledWith(
      jobData.notification_log_id,
    );

    const nextJobData = {
      ...jobData,
      notification_log_id: '22222222-2222-4222-8222-222222222222',
    };
    const nextJob = {
      name: SEND_WHATSAPP_NOTIFICATION_JOB,
      data: nextJobData,
    } as Job<SendWhatsAppNotificationJobData>;
    fonnteClient.sendWhatsApp.mockResolvedValueOnce({ success: true });

    await expect(processor.process(nextJob)).resolves.toMatchObject({
      status: 'sent',
    });
    expect(notificationsService.markNotificationSent).toHaveBeenCalledWith(
      nextJobData.notification_log_id,
    );
  });

  it('contains final logging failure so other processing is not interrupted', async () => {
    notificationsService.markNotificationFailed.mockRejectedValue(
      new Error('database unavailable'),
    );
    const finalJob = {
      data: jobData,
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as Job<SendWhatsAppNotificationJobData>;

    await expect(processor.onFailed(finalJob)).resolves.toBeUndefined();
  });

  it('rejects unknown jobs', async () => {
    await expect(
      processor.process({
        name: 'unknown',
        data: jobData,
      } as Job<SendWhatsAppNotificationJobData>),
    ).rejects.toThrow('Job notifikasi tidak dikenal: unknown');
  });
});
