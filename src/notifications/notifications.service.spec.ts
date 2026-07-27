import type { Queue } from 'bullmq';
import {
  NotificationChannel,
  NotificationStatus,
  ReminderStatus,
  ReminderType,
  RiskBadge,
  UserRole,
} from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { FamilyCircleService } from '../family-circle/family-circle.service.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DueReminder } from '../reminders/reminders.service.js';
import { FonnteClient } from './fonnte.client.js';
import { SEND_WHATSAPP_NOTIFICATION_JOB } from './notifications.constants.js';
import {
  NotificationsService,
  type SendWhatsAppNotificationJobData,
} from './notifications.service.js';

describe('NotificationsService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const logId = '22222222-2222-4222-8222-222222222222';
  const requester: CurrentUserData = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.IBU_HAMIL,
    puskesmas_id: '44444444-4444-4444-8444-444444444444',
  };
  const pendingLog = {
    id: logId,
    pregnancy_profile_id: profileId,
    channel: NotificationChannel.WA_PATIENT,
    message: 'Pesan',
    status: NotificationStatus.PENDING,
    sent_at: null,
    created_at: new Date('2026-07-27T08:00:00.000Z'),
  };
  const reminder = {
    id: '55555555-5555-4555-8555-555555555555',
    pregnancy_profile_id: profileId,
    reminder_type: ReminderType.ANC_CHECKUP,
    cadence_days: 7,
    next_trigger_at: new Date('2026-07-27T00:00:00.000Z'),
    last_sent_at: null,
    status: ReminderStatus.ACTIVE,
    pregnancy_profile: {
      id: profileId,
      user: {
        id: requester.id,
        full_name: 'Siti Rahmawati',
        phone_number: '+6281410000001',
        puskesmas_id: requester.puskesmas_id,
      },
    },
  } as DueReminder;
  const prisma = {
    pregnancyProfile: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    notificationLog: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const fonnteClient = { sendWhatsApp: jest.fn() };
  const familyCircleService = { findContactsForNotification: jest.fn() };
  const pregnancyProfilesService = { findOne: jest.fn() };
  let lastNotificationUpdate:
    | {
        where: { id: string };
        data: Record<string, unknown>;
      }
    | undefined;
  const queue = {
    add: jest.fn(
      (
        name: string,
        data: SendWhatsAppNotificationJobData,
        options: Record<string, unknown>,
      ) => {
        void name;
        void data;
        void options;
        return Promise.resolve({ id: logId });
      },
    ),
  };
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    lastNotificationUpdate = undefined;
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      fonnteClient as unknown as FonnteClient,
      familyCircleService as unknown as FamilyCircleService,
      pregnancyProfilesService as unknown as PregnancyProfilesService,
      queue as unknown as Queue<SendWhatsAppNotificationJobData>,
    );
    prisma.notificationLog.create.mockResolvedValue(pendingLog);
    prisma.notificationLog.update.mockImplementation(
      (input: { where: { id: string }; data: Record<string, unknown> }) => {
        lastNotificationUpdate = input;
        return Promise.resolve({ ...pendingLog, ...input.data });
      },
    );
    prisma.user.findMany.mockResolvedValue([]);
    familyCircleService.findContactsForNotification.mockResolvedValue([]);
    queue.add.mockResolvedValue({ id: logId });
  });

  it('calls Fonnte and stores a sent log for direct delivery', async () => {
    fonnteClient.sendWhatsApp.mockResolvedValue({ success: true });

    const result = await service.sendNotification(
      NotificationChannel.WA_PATIENT,
      profileId,
      '+6281410000001',
      'Pesan',
    );

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: {
        pregnancy_profile_id: profileId,
        channel: NotificationChannel.WA_PATIENT,
        message: 'Pesan',
        status: NotificationStatus.PENDING,
        sent_at: undefined,
      },
    });
    expect(fonnteClient.sendWhatsApp).toHaveBeenCalledWith(
      '+6281410000001',
      'Pesan',
    );
    expect(lastNotificationUpdate?.where).toEqual({ id: logId });
    expect(lastNotificationUpdate?.data.status).toBe(NotificationStatus.SENT);
    expect(lastNotificationUpdate?.data.sent_at).toBeInstanceOf(Date);
    expect(result.success).toBe(true);
  });

  it('stores failed when direct Fonnte delivery fails', async () => {
    fonnteClient.sendWhatsApp.mockResolvedValue({ success: false });

    await expect(
      service.sendNotification(
        NotificationChannel.WA_PATIENT,
        profileId,
        '+6281410000001',
        'Pesan',
      ),
    ).resolves.toMatchObject({ success: false });
    expect(prisma.notificationLog.update).toHaveBeenCalledWith({
      where: { id: logId },
      data: { status: NotificationStatus.FAILED, sent_at: null },
    });
  });

  it('queues one isolated retryable job for the patient reminder', async () => {
    prisma.pregnancyProfile.findUnique.mockResolvedValue({
      id: profileId,
      nifas_start_date: null,
      user: {
        full_name: 'Siti Rahmawati',
        phone_number: '+6281410000001',
        puskesmas_id: requester.puskesmas_id,
      },
      risk_assessments: [],
    });

    await service.dispatchReminder(reminder);

    const [jobName, jobData, jobOptions] = queue.add.mock.calls[0];
    expect(jobName).toBe(SEND_WHATSAPP_NOTIFICATION_JOB);
    expect(jobData.notification_log_id).toBe(logId);
    expect(jobData.phone_number).toBe('+6281410000001');
    expect(jobData.message).toContain('pemeriksaan kehamilan rutin');
    expect(jobOptions).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      jobId: logId,
      removeOnComplete: true,
      removeOnFail: false,
    });
    expect(fonnteClient.sendWhatsApp).not.toHaveBeenCalled();
  });

  it('queues yellow-risk family and same-puskesmas midwife updates', async () => {
    prisma.pregnancyProfile.findUnique.mockResolvedValue({
      id: profileId,
      nifas_start_date: null,
      user: {
        full_name: 'Siti Rahmawati',
        phone_number: '+6281410000001',
        puskesmas_id: requester.puskesmas_id,
      },
      risk_assessments: [{ risk_badge: RiskBadge.KUNING }],
    });
    familyCircleService.findContactsForNotification.mockResolvedValue([
      { contact_phone: '+6281510000001' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { phone_number: '+6281210000001' },
    ]);

    await service.sendReminderNotification(reminder);

    expect(
      familyCircleService.findContactsForNotification,
    ).toHaveBeenCalledWith(profileId, RiskBadge.KUNING);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        role: UserRole.BIDAN,
        puskesmas_id: requester.puskesmas_id,
      },
      select: { phone_number: true },
    });
    expect(queue.add).toHaveBeenCalledTimes(3);
    expect(queue.add.mock.calls.map((call) => call[1].phone_number)).toEqual(
      expect.arrayContaining([
        '+6281410000001',
        '+6281510000001',
        '+6281210000001',
      ]),
    );
  });

  it('queues scheduled red-risk follow-up without owning the risk callback', async () => {
    prisma.pregnancyProfile.findUnique.mockResolvedValue({
      id: profileId,
      nifas_start_date: null,
      user: {
        full_name: 'Siti Rahmawati',
        phone_number: '+6281410000001',
        puskesmas_id: requester.puskesmas_id,
      },
      risk_assessments: [{ risk_badge: RiskBadge.MERAH }],
    });
    familyCircleService.findContactsForNotification.mockResolvedValue([
      { contact_phone: '+6281510000001' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { phone_number: '+6281210000001' },
    ]);

    await service.sendReminderNotification(reminder);

    expect(
      familyCircleService.findContactsForNotification,
    ).toHaveBeenCalledWith(profileId, RiskBadge.MERAH);
    expect(prisma.user.findMany).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(3);
  });

  it('marks enqueue failure without rejecting other reminder processing', async () => {
    prisma.pregnancyProfile.findUnique.mockResolvedValue({
      id: profileId,
      nifas_start_date: null,
      user: {
        full_name: 'Siti Rahmawati',
        phone_number: '+6281410000001',
        puskesmas_id: requester.puskesmas_id,
      },
      risk_assessments: [],
    });
    queue.add.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.dispatchReminder(reminder)).resolves.toBeUndefined();
    expect(prisma.notificationLog.update).toHaveBeenCalledWith({
      where: { id: logId },
      data: { status: NotificationStatus.FAILED, sent_at: null },
    });
  });

  it('returns authorized paginated history filtered by channel and status', async () => {
    pregnancyProfilesService.findOne.mockResolvedValue({ id: profileId });
    prisma.notificationLog.findMany.mockResolvedValue([pendingLog]);
    prisma.notificationLog.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    await expect(
      service.getNotificationHistory(
        profileId,
        {
          pregnancy_profile_id: profileId,
          channel: NotificationChannel.WA_PATIENT,
          status: NotificationStatus.PENDING,
          limit: 10,
          offset: 5,
        },
        requester,
      ),
    ).resolves.toEqual({ data: [pendingLog], total: 1 });
    expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
      profileId,
      requester,
    );
    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith({
      where: {
        pregnancy_profile_id: profileId,
        channel: NotificationChannel.WA_PATIENT,
        status: NotificationStatus.PENDING,
      },
      orderBy: { created_at: 'desc' },
      skip: 5,
      take: 10,
    });
  });

  it('authorizes notification detail through its pregnancy profile', async () => {
    prisma.notificationLog.findUnique.mockResolvedValue(pendingLog);
    pregnancyProfilesService.findOne.mockResolvedValue({ id: profileId });

    await expect(service.findOne(logId, requester)).resolves.toEqual(
      pendingLog,
    );
    expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
      profileId,
      requester,
    );
  });
});
