import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client.js';
import {
  NotificationChannel,
  NotificationStatus,
  RiskBadge,
  UserRole,
} from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { FamilyCircleService } from '../family-circle/family-circle.service.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DueReminder } from '../reminders/reminders.service.js';
import { QueryNotificationsDto } from './dto/query-notifications.dto.js';
import { FonnteClient } from './fonnte.client.js';
import {
  NOTIFICATIONS_QUEUE,
  SEND_WHATSAPP_NOTIFICATION_JOB,
} from './notifications.constants.js';

export interface SendWhatsAppNotificationJobData {
  notification_log_id: string;
  phone_number: string;
  message: string;
}

const TEMPLATES = {
  ancReminder: (name: string, date: string) =>
    `Halo ${name}, waktunya pemeriksaan kehamilan rutin Anda. Jadwal berikutnya: ${date}. Jaga kesehatan Anda dan calon buah hati. 🤰`,
  postpartumReminder: (name: string, day: number) =>
    `Halo ${name}, waktunya check-in nifas hari ke-${day}. Silakan isi laporan kondisi harian Anda di aplikasi MaternIn. 💛`,
  bidanAlert: (patientName: string, riskBadge: string) =>
    `[MaternIn] Pasien ${patientName} memiliki status risiko ${riskBadge}. Mohon segera ditindaklanjuti.`,
  familyUpdate: (patientName: string, riskBadge: string) =>
    `[MaternIn] Update kondisi ${patientName}: status risiko ${riskBadge}. Pastikan ia mendapat dukungan dan perhatian.`,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fonnteClient: FonnteClient,
    private readonly familyCircleService: FamilyCircleService,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue<SendWhatsAppNotificationJobData>,
  ) {}

  async dispatchReminder(reminder: DueReminder): Promise<void> {
    await this.sendReminderNotification(reminder);
  }

  async sendReminderNotification(reminder: DueReminder): Promise<void> {
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: reminder.pregnancy_profile_id },
      select: {
        id: true,
        nifas_start_date: true,
        user: {
          select: {
            full_name: true,
            phone_number: true,
            puskesmas_id: true,
          },
        },
        risk_assessments: {
          select: { risk_badge: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Profil kehamilan tidak ditemukan');
    }

    const patientMessage =
      reminder.reminder_type === 'anc_checkup'
        ? TEMPLATES.ancReminder(
            profile.user.full_name,
            this.formatDate(reminder.next_trigger_at),
          )
        : TEMPLATES.postpartumReminder(
            profile.user.full_name,
            this.resolvePostpartumDay(profile.nifas_start_date),
          );
    const recipients = [
      {
        channel: NotificationChannel.WA_PATIENT,
        phoneNumber: profile.user.phone_number,
        message: patientMessage,
      },
    ];
    const riskBadge: `${RiskBadge}` | undefined =
      profile.risk_assessments[0]?.risk_badge;

    // Jalur ini hanya follow-up reminder terjadwal. Alert Merah langsung tetap
    // dimiliki AI Service dan tidak dipicu ulang dari callback risk assessment.
    if (riskBadge) {
      const familyContacts =
        await this.familyCircleService.findContactsForNotification(
          profile.id,
          riskBadge as RiskBadge,
        );

      recipients.push(
        ...familyContacts.map((contact) => ({
          channel: NotificationChannel.WA_FAMILY,
          phoneNumber: contact.contact_phone,
          message: TEMPLATES.familyUpdate(profile.user.full_name, riskBadge),
        })),
      );
    }

    if (
      (riskBadge === 'kuning' || riskBadge === 'merah') &&
      profile.user.puskesmas_id !== null
    ) {
      const midwives = await this.prisma.user.findMany({
        where: {
          role: UserRole.BIDAN,
          puskesmas_id: profile.user.puskesmas_id,
        },
        select: { phone_number: true },
      });

      recipients.push(
        ...midwives.map((midwife) => ({
          channel: NotificationChannel.WA_BIDAN,
          phoneNumber: midwife.phone_number,
          message: TEMPLATES.bidanAlert(profile.user.full_name, riskBadge),
        })),
      );
    }

    await Promise.all(
      recipients.map(({ channel, phoneNumber, message }) =>
        this.enqueueWhatsAppNotification(
          channel,
          profile.id,
          phoneNumber,
          message,
        ),
      ),
    );
  }

  async sendNotification(
    channel: NotificationChannel,
    profileId: string,
    phoneNumber: string,
    message: string,
  ) {
    const log = await this.logNotification(
      profileId,
      channel,
      message,
      NotificationStatus.PENDING,
    );
    const result = await this.fonnteClient.sendWhatsApp(phoneNumber, message);
    const notificationLog = result.success
      ? await this.markNotificationSent(log.id)
      : await this.markNotificationFailed(log.id);

    return { success: result.success, notification_log: notificationLog };
  }

  logNotification(
    profileId: string,
    channel: NotificationChannel,
    message: string,
    status: NotificationStatus,
    sentAt?: Date,
  ) {
    return this.prisma.notificationLog.create({
      data: {
        pregnancy_profile_id: profileId,
        channel,
        message,
        status,
        sent_at: sentAt,
      },
    });
  }

  markNotificationSent(id: string) {
    return this.prisma.notificationLog.update({
      where: { id },
      data: { status: NotificationStatus.SENT, sent_at: new Date() },
    });
  }

  markNotificationFailed(id: string) {
    return this.prisma.notificationLog.update({
      where: { id },
      data: { status: NotificationStatus.FAILED, sent_at: null },
    });
  }

  async getNotificationHistory(
    profileId: string,
    query: QueryNotificationsDto,
    requester: CurrentUserData,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const where: Prisma.NotificationLogWhereInput = {
      pregnancy_profile_id: profileId,
      ...(query.channel && { channel: query.channel }),
      ...(query.status && { status: query.status }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester: CurrentUserData) {
    const notification = await this.prisma.notificationLog.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notifikasi tidak ditemukan');
    }

    await this.pregnancyProfilesService.findOne(
      notification.pregnancy_profile_id,
      requester,
    );

    return notification;
  }

  private async enqueueWhatsAppNotification(
    channel: NotificationChannel,
    profileId: string,
    phoneNumber: string,
    message: string,
  ) {
    const log = await this.logNotification(
      profileId,
      channel,
      message,
      NotificationStatus.PENDING,
    );

    try {
      await this.notificationsQueue.add(
        SEND_WHATSAPP_NOTIFICATION_JOB,
        {
          notification_log_id: log.id,
          phone_number: phoneNumber,
          message,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          jobId: log.id,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      return log;
    } catch {
      this.logger.error(`Notifikasi ${log.id} gagal dimasukkan ke antrean`);
      return this.markNotificationFailed(log.id);
    }
  }

  private formatDate(date: Date) {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(date);
  }

  private resolvePostpartumDay(nifasStartDate: Date | null) {
    if (!nifasStartDate) {
      return 1;
    }

    const start = Date.UTC(
      nifasStartDate.getUTCFullYear(),
      nifasStartDate.getUTCMonth(),
      nifasStartDate.getUTCDate(),
    );
    const now = new Date();
    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );

    return Math.max(1, Math.floor((today - start) / 86_400_000) + 1);
  }
}
