import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  ReminderStatus,
  ReminderType,
  RiskBadge,
} from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueryRemindersDto } from './dto/query-reminders.dto.js';

const dueReminderInclude = {
  pregnancy_profile: {
    include: {
      user: {
        select: {
          id: true,
          full_name: true,
          phone_number: true,
          puskesmas_id: true,
        },
      },
    },
  },
} satisfies Prisma.ReminderInclude;

export type DueReminder = Prisma.ReminderGetPayload<{
  include: typeof dueReminderInclude;
}>;

@Injectable()
export class RemindersService {
  static readonly INITIAL_ANC_CADENCE_DAYS = 14;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PregnancyProfilesService))
    private readonly pregnancyProfilesService: PregnancyProfilesService,
  ) {}

  createAncReminder(
    profileId: string,
    riskBadge: RiskBadge,
    transaction?: Prisma.TransactionClient,
  ) {
    const cadenceDays = this.ancCadenceDays(riskBadge);

    return this.upsertReminder(
      profileId,
      ReminderType.ANC_CHECKUP,
      cadenceDays,
      transaction,
    );
  }

  async updateCadenceOnNewAssessment(
    profileId: string,
    riskBadge: RiskBadge,
    transaction?: Prisma.TransactionClient,
  ) {
    const cadenceDays = this.ancCadenceDays(riskBadge);
    const client = transaction ?? this.prisma;
    const profile = await client.pregnancyProfile.findUnique({
      where: { id: profileId },
      select: { status: true },
    });

    if (profile?.status !== 'hamil') {
      return { count: 0 };
    }

    const updated = await client.reminder.updateMany({
      where: {
        pregnancy_profile_id: profileId,
        reminder_type: ReminderType.ANC_CHECKUP,
        status: ReminderStatus.ACTIVE,
      },
      data: {
        cadence_days: cadenceDays,
        next_trigger_at: this.addDays(new Date(), cadenceDays),
      },
    });

    if (updated.count > 0) {
      return updated;
    }

    const existing = await client.reminder.findUnique({
      where: {
        pregnancy_profile_id_reminder_type: {
          pregnancy_profile_id: profileId,
          reminder_type: ReminderType.ANC_CHECKUP,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return updated;
    }

    await this.createAncReminder(profileId, riskBadge, transaction);
    return { count: 1 };
  }

  createPostpartumReminder(
    profileId: string,
    dayNumber: number,
    transaction?: Prisma.TransactionClient,
  ) {
    const cadenceDays = this.postpartumCadenceDays(dayNumber);

    return this.upsertReminder(
      profileId,
      ReminderType.POSTPARTUM_CHECKIN,
      cadenceDays,
      transaction,
    );
  }

  async updatePostpartumCadence(
    profileId: string,
    dayNumber: number,
    transaction?: Prisma.TransactionClient,
  ) {
    const cadenceDays = this.postpartumCadenceDays(dayNumber);
    const client = transaction ?? this.prisma;

    return client.reminder.updateMany({
      where: {
        pregnancy_profile_id: profileId,
        reminder_type: ReminderType.POSTPARTUM_CHECKIN,
        status: ReminderStatus.ACTIVE,
      },
      data: {
        cadence_days: cadenceDays,
        next_trigger_at: this.addDays(new Date(), cadenceDays),
      },
    });
  }

  getDueReminders(): Promise<DueReminder[]> {
    return this.prisma.reminder.findMany({
      where: {
        status: ReminderStatus.ACTIVE,
        next_trigger_at: { lte: new Date() },
      },
      include: dueReminderInclude,
      orderBy: { next_trigger_at: 'asc' },
    });
  }

  async markSent(reminderId: string) {
    const reminder = await this.findReminderOrThrow(reminderId);
    const sentAt = new Date();

    if (reminder.status !== 'active') {
      throw new BadRequestException('Hanya reminder aktif yang dapat dikirim');
    }

    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        last_sent_at: sentAt,
        next_trigger_at: this.addDays(sentAt, reminder.cadence_days),
      },
    });
  }

  async pauseReminder(reminderId: string, requester: CurrentUserData) {
    const reminder = await this.findOne(reminderId, requester);

    if (reminder.status === 'done') {
      throw new BadRequestException(
        'Reminder yang sudah selesai tidak dapat dijeda',
      );
    }

    if (reminder.status === 'paused') {
      return reminder;
    }

    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: { status: ReminderStatus.PAUSED },
    });
  }

  async resumeReminder(reminderId: string, requester: CurrentUserData) {
    const reminder = await this.findOne(reminderId, requester);

    if (reminder.status === 'done') {
      throw new BadRequestException(
        'Reminder yang sudah selesai tidak dapat diaktifkan kembali',
      );
    }

    if (reminder.status === 'active') {
      return reminder;
    }

    const cadenceDays = await this.resolveCurrentCadence(reminder);

    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: ReminderStatus.ACTIVE,
        cadence_days: cadenceDays,
        next_trigger_at: this.addDays(new Date(), cadenceDays),
      },
    });
  }

  async completeReminder(reminderId: string) {
    await this.findReminderOrThrow(reminderId);

    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: { status: ReminderStatus.DONE },
    });
  }

  completeProfileReminders(
    profileId: string,
    reminderType?: ReminderType,
    transaction?: Prisma.TransactionClient,
  ) {
    const client = transaction ?? this.prisma;

    return client.reminder.updateMany({
      where: {
        pregnancy_profile_id: profileId,
        ...(reminderType && { reminder_type: reminderType }),
        status: { not: ReminderStatus.DONE },
      },
      data: { status: ReminderStatus.DONE },
    });
  }

  async findByProfile(
    profileId: string,
    query: QueryRemindersDto,
    requester: CurrentUserData,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const where: Prisma.ReminderWhereInput = {
      pregnancy_profile_id: profileId,
      ...(query.reminder_type && { reminder_type: query.reminder_type }),
      ...(query.status && { status: query.status }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.reminder.findMany({
        where,
        orderBy: { next_trigger_at: 'asc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.reminder.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester: CurrentUserData) {
    const reminder = await this.findReminderOrThrow(id);

    await this.pregnancyProfilesService.findOne(
      reminder.pregnancy_profile_id,
      requester,
    );

    return reminder;
  }

  ancCadenceDays(riskBadge: `${RiskBadge}`) {
    switch (riskBadge) {
      case 'merah':
        return 3;
      case 'kuning':
        return 7;
      case 'hijau':
        return RemindersService.INITIAL_ANC_CADENCE_DAYS;
    }
  }

  postpartumCadenceDays(dayNumber: number) {
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 42) {
      throw new BadRequestException('day_number harus antara 1 dan 42');
    }

    if (dayNumber <= 3) {
      return 1;
    }

    if (dayNumber <= 14) {
      return 2;
    }

    return 7;
  }

  private upsertReminder(
    profileId: string,
    reminderType: ReminderType,
    cadenceDays: number,
    transaction?: Prisma.TransactionClient,
  ) {
    const client = transaction ?? this.prisma;

    return client.reminder.upsert({
      where: {
        pregnancy_profile_id_reminder_type: {
          pregnancy_profile_id: profileId,
          reminder_type: reminderType,
        },
      },
      create: {
        pregnancy_profile_id: profileId,
        reminder_type: reminderType,
        cadence_days: cadenceDays,
        next_trigger_at: this.addDays(new Date(), cadenceDays),
        status: ReminderStatus.ACTIVE,
      },
      update: {
        cadence_days: cadenceDays,
        next_trigger_at: this.addDays(new Date(), cadenceDays),
      },
    });
  }

  private async findReminderOrThrow(id: string) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });

    if (!reminder) {
      throw new NotFoundException('Reminder tidak ditemukan');
    }

    return reminder;
  }

  private async resolveCurrentCadence(reminder: {
    pregnancy_profile_id: string;
    reminder_type: string;
    cadence_days: number;
  }) {
    if (reminder.reminder_type === 'anc_checkup') {
      const assessment = await this.prisma.riskAssessment.findFirst({
        where: { pregnancy_profile_id: reminder.pregnancy_profile_id },
        select: { risk_badge: true },
        orderBy: { created_at: 'desc' },
      });

      return assessment
        ? this.ancCadenceDays(assessment.risk_badge)
        : reminder.cadence_days;
    }

    const postpartumLog = await this.prisma.postpartumLog.findFirst({
      where: { pregnancy_profile_id: reminder.pregnancy_profile_id },
      select: { day_number: true },
      orderBy: { created_at: 'desc' },
    });

    return postpartumLog
      ? this.postpartumCadenceDays(postpartumLog.day_number)
      : reminder.cadence_days;
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }
}
