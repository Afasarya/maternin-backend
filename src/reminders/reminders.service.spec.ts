import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ReminderStatus,
  ReminderType,
  RiskBadge,
  UserRole,
} from '../common/constants/index.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RemindersService } from './reminders.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));

describe('RemindersService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const reminderId = '22222222-2222-4222-8222-222222222222';
  const otherRegionProfileId = '55555555-5555-4555-8555-555555555555';
  const patientId = '33333333-3333-4333-8333-333333333333';
  const puskesmasId = '44444444-4444-4444-8444-444444444444';
  const requester = {
    id: patientId,
    role: UserRole.IBU_HAMIL,
    puskesmas_id: puskesmasId,
  };
  const activeAncReminder = {
    id: reminderId,
    pregnancy_profile_id: profileId,
    reminder_type: ReminderType.ANC_CHECKUP,
    cadence_days: 14,
    next_trigger_at: new Date('2026-08-08T10:00:00.000Z'),
    last_sent_at: null,
    status: ReminderStatus.ACTIVE,
  };
  const prisma = {
    reminder: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    riskAssessment: {
      findFirst: jest.fn(),
    },
    postpartumLog: {
      findFirst: jest.fn(),
    },
    pregnancyProfile: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const pregnancyProfilesService = {
    findOne: jest.fn(),
  };
  const service = new RemindersService(
    prisma as unknown as PrismaService,
    pregnancyProfilesService as unknown as PregnancyProfilesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.reminder.upsert.mockResolvedValue(activeAncReminder);
    prisma.reminder.updateMany.mockResolvedValue({ count: 1 });
    prisma.reminder.findUnique.mockResolvedValue(activeAncReminder);
    prisma.pregnancyProfile.findUnique.mockResolvedValue({ status: 'hamil' });
    prisma.reminder.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...activeAncReminder, ...data }),
    );
    prisma.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );
    pregnancyProfilesService.findOne.mockResolvedValue({ id: profileId });
  });

  describe('ANC cadence', () => {
    it.each([
      [RiskBadge.MERAH, 3],
      [RiskBadge.KUNING, 7],
      [RiskBadge.HIJAU, 14],
    ])('upserts %s ANC reminder with %i-day cadence', async (badge, days) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-25T10:00:00.000Z'));

      try {
        await service.createAncReminder(profileId, badge);

        expect(prisma.reminder.upsert).toHaveBeenCalledWith({
          where: {
            pregnancy_profile_id_reminder_type: {
              pregnancy_profile_id: profileId,
              reminder_type: ReminderType.ANC_CHECKUP,
            },
          },
          create: {
            pregnancy_profile_id: profileId,
            reminder_type: ReminderType.ANC_CHECKUP,
            cadence_days: days,
            next_trigger_at: new Date(Date.UTC(2026, 6, 25 + days, 10)),
            status: ReminderStatus.ACTIVE,
          },
          update: {
            cadence_days: days,
            next_trigger_at: new Date(Date.UTC(2026, 6, 25 + days, 10)),
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('updates only an active ANC reminder after a new assessment', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-25T10:00:00.000Z'));

      try {
        await service.updateCadenceOnNewAssessment(profileId, RiskBadge.MERAH);

        expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
          where: {
            pregnancy_profile_id: profileId,
            reminder_type: ReminderType.ANC_CHECKUP,
            status: ReminderStatus.ACTIVE,
          },
          data: {
            cadence_days: 3,
            next_trigger_at: new Date('2026-07-28T10:00:00.000Z'),
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('creates an ANC reminder for a legacy profile without one', async () => {
      prisma.reminder.updateMany.mockResolvedValue({ count: 0 });
      prisma.reminder.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCadenceOnNewAssessment(profileId, RiskBadge.KUNING),
      ).resolves.toEqual({ count: 1 });

      expect(prisma.reminder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            pregnancy_profile_id: profileId,
            cadence_days: 7,
          }) as object,
        }),
      );
    });

    it('does not create an ANC reminder for a completed legacy profile', async () => {
      prisma.reminder.updateMany.mockResolvedValue({ count: 0 });
      prisma.reminder.findUnique.mockResolvedValue(null);
      prisma.pregnancyProfile.findUnique.mockResolvedValue({
        status: 'selesai',
      });

      await expect(
        service.updateCadenceOnNewAssessment(profileId, RiskBadge.MERAH),
      ).resolves.toEqual({ count: 0 });
      expect(prisma.reminder.upsert).not.toHaveBeenCalled();
    });
  });

  describe('postpartum cadence', () => {
    it.each([
      [1, 1],
      [3, 1],
      [4, 2],
      [14, 2],
      [15, 7],
      [42, 7],
    ])('maps postpartum day %i to %i-day cadence', (day, days) => {
      expect(service.postpartumCadenceDays(day)).toBe(days);
    });

    it.each([0, 43, 1.5])('rejects invalid postpartum day %s', (day) => {
      expect(() => service.postpartumCadenceDays(day)).toThrow(
        BadRequestException,
      );
    });

    it('updates an active postpartum reminder without resuming paused rows', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-25T10:00:00.000Z'));

      try {
        await service.updatePostpartumCadence(profileId, 15);

        expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
          where: {
            pregnancy_profile_id: profileId,
            reminder_type: ReminderType.POSTPARTUM_CHECKIN,
            status: ReminderStatus.ACTIVE,
          },
          data: {
            cadence_days: 7,
            next_trigger_at: new Date('2026-08-01T10:00:00.000Z'),
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('scheduler operations', () => {
    it('returns due reminders oldest trigger first', async () => {
      const dueReminder = {
        ...activeAncReminder,
        pregnancy_profile: { user: { id: patientId } },
      };
      prisma.reminder.findMany.mockResolvedValue([dueReminder]);
      jest.useFakeTimers().setSystemTime(new Date('2026-07-25T10:00:00.000Z'));

      try {
        await expect(service.getDueReminders()).resolves.toEqual([dueReminder]);
        expect(prisma.reminder.findMany).toHaveBeenCalledWith({
          where: {
            status: ReminderStatus.ACTIVE,
            next_trigger_at: { lte: new Date('2026-07-25T10:00:00.000Z') },
          },
          include: {
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
          },
          orderBy: { next_trigger_at: 'asc' },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('marks sent and advances from one shared UTC timestamp', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-25T10:00:00.000Z'));

      try {
        await service.markSent(reminderId);
        expect(prisma.reminder.update).toHaveBeenCalledWith({
          where: { id: reminderId },
          data: {
            last_sent_at: new Date('2026-07-25T10:00:00.000Z'),
            next_trigger_at: new Date('2026-08-08T10:00:00.000Z'),
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('rejects markSent for a paused reminder', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...activeAncReminder,
        status: ReminderStatus.PAUSED,
      });

      await expect(service.markSent(reminderId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });
  });

  describe('read and state management', () => {
    it('lists reminders with pagination and filters after access validation', async () => {
      prisma.reminder.findMany.mockResolvedValue([activeAncReminder]);
      prisma.reminder.count.mockResolvedValue(1);
      const query = {
        pregnancy_profile_id: profileId,
        reminder_type: ReminderType.ANC_CHECKUP,
        status: ReminderStatus.ACTIVE,
        limit: 10,
        offset: 5,
      };

      await expect(
        service.findByProfile(profileId, query, requester),
      ).resolves.toEqual({ data: [activeAncReminder], total: 1 });

      const where = {
        pregnancy_profile_id: profileId,
        reminder_type: ReminderType.ANC_CHECKUP,
        status: ReminderStatus.ACTIVE,
      };
      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        profileId,
        requester,
      );
      expect(prisma.reminder.findMany).toHaveBeenCalledWith({
        where,
        orderBy: { next_trigger_at: 'asc' },
        skip: 5,
        take: 10,
      });
      expect(prisma.reminder.count).toHaveBeenCalledWith({ where });
    });

    it('returns one reminder after profile access validation', async () => {
      await expect(service.findOne(reminderId, requester)).resolves.toEqual(
        activeAncReminder,
      );
      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        profileId,
        requester,
      );
    });

    it('propagates profile access denial', async () => {
      pregnancyProfilesService.findOne.mockRejectedValue(
        new ForbiddenException('Tidak memiliki akses'),
      );

      await expect(
        service.findOne(reminderId, requester),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects list access denied by profile scoping', async () => {
      pregnancyProfilesService.findOne.mockRejectedValue(
        new ForbiddenException('Tidak memiliki akses'),
      );

      await expect(
        service.findByProfile(
          profileId,
          {
            pregnancy_profile_id: profileId,
            limit: 20,
            offset: 0,
          },
          requester,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.reminder.findMany).not.toHaveBeenCalled();
    });

    it('allows admin to list reminders from another profile and region', async () => {
      const outsideReminder = {
        ...activeAncReminder,
        pregnancy_profile_id: otherRegionProfileId,
      };
      const admin = {
        id: patientId,
        role: UserRole.ADMIN,
        puskesmas_id: null,
      };
      prisma.reminder.findMany.mockResolvedValue([outsideReminder]);
      prisma.reminder.count.mockResolvedValue(1);

      await expect(
        service.findByProfile(
          otherRegionProfileId,
          {
            pregnancy_profile_id: otherRegionProfileId,
            limit: 20,
            offset: 0,
          },
          admin,
        ),
      ).resolves.toEqual({ data: [outsideReminder], total: 1 });
      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        otherRegionProfileId,
        admin,
      );
    });

    it('throws when reminder does not exist', async () => {
      prisma.reminder.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(reminderId, requester),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pregnancyProfilesService.findOne).not.toHaveBeenCalled();
    });

    it('pauses an active reminder', async () => {
      await service.pauseReminder(reminderId, requester);
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: reminderId },
        data: { status: ReminderStatus.PAUSED },
      });
    });

    it('resumes ANC using the latest risk badge and resets next trigger', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...activeAncReminder,
        status: ReminderStatus.PAUSED,
      });
      prisma.riskAssessment.findFirst.mockResolvedValue({
        risk_badge: RiskBadge.MERAH,
      });
      jest.useFakeTimers().setSystemTime(new Date('2026-07-25T10:00:00.000Z'));

      try {
        await service.resumeReminder(reminderId, requester);
        expect(prisma.reminder.update).toHaveBeenCalledWith({
          where: { id: reminderId },
          data: {
            status: ReminderStatus.ACTIVE,
            cadence_days: 3,
            next_trigger_at: new Date('2026-07-28T10:00:00.000Z'),
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('rejects pausing or resuming a completed reminder', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...activeAncReminder,
        status: ReminderStatus.DONE,
      });

      await expect(
        service.pauseReminder(reminderId, requester),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.resumeReminder(reminderId, requester),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
