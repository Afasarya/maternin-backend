import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  PregnancyStatus,
  RiskBadge,
  UserRole,
} from '../common/constants/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportsService } from './reports.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

describe('ReportsService', () => {
  const puskesmasId = '11111111-1111-4111-8111-111111111111';
  const anotherPuskesmasId = '22222222-2222-4222-8222-222222222222';
  const bidan = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.BIDAN,
    puskesmas_id: puskesmasId,
  };
  const admin = {
    id: '44444444-4444-4444-8444-444444444444',
    role: UserRole.ADMIN,
    puskesmas_id: null,
  };
  const prisma = {
    puskesmas: { findUnique: jest.fn() },
    pregnancyProfile: { findMany: jest.fn() },
    ancRecord: { count: jest.fn() },
    symptomCheckin: { count: jest.fn() },
    postpartumLog: { findMany: jest.fn() },
    notificationLog: { groupBy: jest.fn() },
  };
  const service = new ReportsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.puskesmas.findUnique.mockResolvedValue({
      name: 'Puskesmas Halmahera',
    });
    prisma.pregnancyProfile.findMany.mockResolvedValue([]);
    prisma.ancRecord.count.mockResolvedValue(0);
    prisma.symptomCheckin.count.mockResolvedValue(0);
    prisma.postpartumLog.findMany.mockResolvedValue([]);
    prisma.notificationLog.groupBy.mockResolvedValue([]);
  });

  it('compiles every report section from the scoped monthly data', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-30T10:00:00.000Z'));
    prisma.pregnancyProfile.findMany.mockResolvedValue([
      {
        id: '50000000-0000-4000-8000-000000000001',
        status: PregnancyStatus.HAMIL,
        hpht: new Date('2026-01-01T00:00:00.000Z'),
        ended_at: null,
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        user: { full_name: 'Zahra Merah' },
        risk_assessments: [
          {
            risk_badge: RiskBadge.MERAH,
            risk_factors: ['Hipertensi', 42, 'Riwayat preeklamsia'],
          },
        ],
        symptom_checkins: [
          { created_at: new Date('2026-07-18T08:00:00.000Z') },
        ],
      },
      {
        id: '50000000-0000-4000-8000-000000000002',
        status: PregnancyStatus.HAMIL,
        hpht: new Date('2026-03-01T00:00:00.000Z'),
        ended_at: null,
        created_at: new Date('2026-07-02T00:00:00.000Z'),
        user: { full_name: 'Ani Kuning' },
        risk_assessments: [{ risk_badge: RiskBadge.KUNING, risk_factors: [] }],
        symptom_checkins: [],
      },
      {
        id: '50000000-0000-4000-8000-000000000003',
        status: PregnancyStatus.HAMIL,
        hpht: new Date('2026-04-01T00:00:00.000Z'),
        ended_at: null,
        created_at: new Date('2026-07-03T00:00:00.000Z'),
        user: { full_name: 'Belum Dinilai' },
        risk_assessments: [],
        symptom_checkins: [],
      },
      {
        id: '50000000-0000-4000-8000-000000000004',
        status: PregnancyStatus.NIFAS,
        hpht: new Date('2025-09-01T00:00:00.000Z'),
        ended_at: new Date('2026-07-20T00:00:00.000Z'),
        created_at: new Date('2025-09-05T00:00:00.000Z'),
        user: { full_name: 'Ibu Nifas' },
        risk_assessments: [
          { risk_badge: RiskBadge.MERAH, risk_factors: ['Historis'] },
        ],
        symptom_checkins: [],
      },
      {
        id: '50000000-0000-4000-8000-000000000005',
        status: PregnancyStatus.SELESAI,
        hpht: new Date('2025-01-01T00:00:00.000Z'),
        ended_at: new Date('2025-10-01T00:00:00.000Z'),
        created_at: new Date('2025-01-02T00:00:00.000Z'),
        user: { full_name: 'Selesai' },
        risk_assessments: [],
        symptom_checkins: [],
      },
    ]);
    prisma.ancRecord.count.mockResolvedValue(4);
    prisma.symptomCheckin.count.mockResolvedValue(3);
    prisma.postpartumLog.findMany.mockResolvedValue([
      { red_flag_triggered: true, mental_health_flag: false },
      { red_flag_triggered: false, mental_health_flag: true },
    ]);
    prisma.notificationLog.groupBy.mockResolvedValue([
      {
        channel: NotificationChannel.WA_PATIENT,
        status: NotificationStatus.SENT,
        _count: { _all: 2 },
      },
      {
        channel: NotificationChannel.WA_BIDAN,
        status: NotificationStatus.SENT,
        _count: { _all: 1 },
      },
      {
        channel: NotificationChannel.WA_FAMILY,
        status: NotificationStatus.FAILED,
        _count: { _all: 3 },
      },
      {
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.PENDING,
        _count: { _all: 4 },
      },
    ]);

    try {
      await expect(
        service.generateMonthlyReport(bidan, { month: 7, year: 2026 }),
      ).resolves.toEqual({
        report_period: {
          month: 7,
          year: 2026,
          puskesmas_name: 'Puskesmas Halmahera',
        },
        summary: {
          total_pregnant: 3,
          total_nifas: 1,
          total_selesai: 1,
          new_registrations: 2,
          total_anc_visits: 4,
          total_symptom_checkins: 3,
        },
        risk_distribution: {
          merah: { count: 1, patients: ['Zahra Merah'] },
          kuning: { count: 1, patients: ['Ani Kuning'] },
          hijau: { count: 0, patients: [] },
        },
        high_risk_details: [
          {
            patient_name: 'Zahra Merah',
            risk_factors: ['Hipertensi', 'Riwayat preeklamsia'],
            last_checkin: '2026-07-18',
            gestational_week: 30,
          },
        ],
        postpartum_summary: {
          total_nifas_active: 1,
          red_flags_triggered: 1,
          mental_health_flags: 1,
        },
        notification_summary: {
          total_sent: 3,
          total_failed: 3,
          channels: {
            wa_patient: 2,
            wa_bidan: 1,
            wa_family: 0,
            in_app: 0,
          },
        },
        generated_at: new Date('2026-07-30T10:00:00.000Z'),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses UTC half-open boundaries and clinical recorded_at for ANC', async () => {
    await service.generateMonthlyReport(bidan, { month: 7, year: 2026 });

    const startDate = new Date('2026-07-01T00:00:00.000Z');
    const endDateExclusive = new Date('2026-08-01T00:00:00.000Z');
    const profileRelationScope = {
      pregnancy_profile: { user: { puskesmas_id: puskesmasId } },
    };

    expect(prisma.pregnancyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: { puskesmas_id: puskesmasId },
          created_at: { lt: endDateExclusive },
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        select: expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          risk_assessments: expect.objectContaining({
            where: { created_at: { lt: endDateExclusive } },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: 1,
          }),
        }),
      }),
    );
    expect(prisma.ancRecord.count).toHaveBeenCalledWith({
      where: {
        ...profileRelationScope,
        recorded_at: { gte: startDate, lt: endDateExclusive },
      },
    });
    expect(prisma.symptomCheckin.count).toHaveBeenCalledWith({
      where: {
        ...profileRelationScope,
        created_at: { gte: startDate, lt: endDateExclusive },
      },
    });
  });

  it('returns a valid empty report', async () => {
    await expect(
      service.generateMonthlyReport(bidan, { month: 1, year: 2020 }),
    ).resolves.toEqual(
      expect.objectContaining({
        summary: {
          total_pregnant: 0,
          total_nifas: 0,
          total_selesai: 0,
          new_registrations: 0,
          total_anc_visits: 0,
          total_symptom_checkins: 0,
        },
        risk_distribution: {
          merah: { count: 0, patients: [] },
          kuning: { count: 0, patients: [] },
          hijau: { count: 0, patients: [] },
        },
        high_risk_details: [],
      }),
    );
  });

  it('uses current UTC month and year defaults', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:30:00.000Z'));

    try {
      const result = await service.generateMonthlyReport(bidan, {});

      expect(result.report_period).toEqual({
        month: 8,
        year: 2026,
        puskesmas_name: 'Puskesmas Halmahera',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('allows an admin to generate a global report', async () => {
    const result = await service.generateMonthlyReport(admin, {
      month: 7,
      year: 2026,
    });

    expect(result.report_period.puskesmas_name).toBe('Semua Puskesmas');
    expect(prisma.puskesmas.findUnique).not.toHaveBeenCalled();
    expect(prisma.pregnancyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          created_at: { lt: new Date('2026-08-01T00:00:00.000Z') },
        },
      }),
    );
    expect(prisma.ancRecord.count).toHaveBeenCalledWith({
      where: {
        recorded_at: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lt: new Date('2026-08-01T00:00:00.000Z'),
        },
      },
    });
  });

  it('allows an admin to select one puskesmas', async () => {
    await service.generateMonthlyReport(admin, {
      month: 7,
      year: 2026,
      puskesmas_id: anotherPuskesmasId,
    });

    expect(prisma.puskesmas.findUnique).toHaveBeenCalledWith({
      where: { id: anotherPuskesmasId },
      select: { name: true },
    });
  });

  it('rejects a bidan selecting another region', async () => {
    await expect(
      service.generateMonthlyReport(bidan, {
        puskesmas_id: anotherPuskesmasId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.puskesmas.findUnique).not.toHaveBeenCalled();
    expect(prisma.pregnancyProfile.findMany).not.toHaveBeenCalled();
  });

  it('rejects a bidan without an assigned puskesmas', async () => {
    await expect(
      service.generateMonthlyReport({ ...bidan, puskesmas_id: null }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a missing selected puskesmas', async () => {
    prisma.puskesmas.findUnique.mockResolvedValue(null);

    await expect(
      service.generateMonthlyReport(admin, {
        puskesmas_id: anotherPuskesmasId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.pregnancyProfile.findMany).not.toHaveBeenCalled();
  });
});
