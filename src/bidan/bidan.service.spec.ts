import { ForbiddenException } from '@nestjs/common';
import {
  PregnancyStatus,
  RiskBadge,
  UserRole,
} from '../common/constants/index.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BidanCacheService } from './bidan-cache.service.js';
import { BidanService, type BidanPatientItem } from './bidan.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));

jest.mock('./bidan-cache.service.js', () => ({
  BidanCacheService: class BidanCacheService {},
}));

describe('BidanService', () => {
  const puskesmasId = '11111111-1111-4111-8111-111111111111';
  const bidan = {
    id: '22222222-2222-4222-8222-222222222222',
    role: UserRole.BIDAN,
    puskesmas_id: puskesmasId,
  };
  const admin = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.ADMIN,
    puskesmas_id: null,
  };
  const prisma = {
    pregnancyProfile: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    ancRecord: { findFirst: jest.fn() },
    riskAssessment: { findFirst: jest.fn() },
    symptomCheckin: { findMany: jest.fn() },
    postpartumLog: { findMany: jest.fn() },
  };
  const pregnancyProfilesService = { findOne: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };
  const service = new BidanService(
    prisma as unknown as PrismaService,
    pregnancyProfilesService as unknown as PregnancyProfilesService,
    cache as unknown as BidanCacheService,
  );

  const profile = (
    id: string,
    patientName: string,
    riskBadge: RiskBadge | null,
    riskDate = '2026-07-27T08:00:00.000Z',
  ) => ({
    id,
    hpht: new Date('2026-01-01T00:00:00.000Z'),
    hpl: new Date('2026-10-08T00:00:00.000Z'),
    user: {
      full_name: patientName,
      phone_number: `+628${id.slice(-4)}`,
    },
    risk_assessments: riskBadge
      ? [
          {
            risk_badge: riskBadge,
            aggregate_score: { toString: () => '75.00' },
            risk_factors: [`faktor-${riskBadge}`],
            created_at: new Date(riskDate),
          },
        ]
      : [],
    symptom_checkins: [{ created_at: new Date('2026-07-26T00:00:00.000Z') }],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue(undefined);
  });

  it('sorts the whole region by latest risk before pagination', async () => {
    prisma.pregnancyProfile.findMany.mockResolvedValue([
      profile('40000000-0000-4000-8000-000000000004', 'Hijau', RiskBadge.HIJAU),
      profile('40000000-0000-4000-8000-000000000003', 'Tanpa Nilai', null),
      profile('40000000-0000-4000-8000-000000000001', 'Merah', RiskBadge.MERAH),
      profile(
        '40000000-0000-4000-8000-000000000002',
        'Kuning',
        RiskBadge.KUNING,
      ),
    ]);

    const result = await service.getPatients(bidan, {
      limit: 2,
      offset: 0,
    });

    expect(result.data.map(({ patient_name }) => patient_name)).toEqual([
      'Merah',
      'Kuning',
    ]);
    expect(result.total).toBe(4);
    expect(prisma.pregnancyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: { puskesmas_id: puskesmasId },
          status: PregnancyStatus.HAMIL,
        },
      }),
    );
    expect(cache.set).toHaveBeenCalledWith(
      `bidan:patients:${puskesmasId}`,
      expect.any(Array),
      300,
    );
  });

  it('filters the latest badge and search before calculating total', async () => {
    prisma.pregnancyProfile.findMany.mockResolvedValue([
      profile(
        '40000000-0000-4000-8000-000000000001',
        'Siti Merah',
        RiskBadge.MERAH,
      ),
      profile(
        '40000000-0000-4000-8000-000000000002',
        'Ayu Merah',
        RiskBadge.MERAH,
      ),
      profile(
        '40000000-0000-4000-8000-000000000003',
        'Siti Hijau',
        RiskBadge.HIJAU,
      ),
    ]);

    const result = await service.getPatients(bidan, {
      risk_badge: RiskBadge.MERAH,
      search: 'siti',
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        patient_name: 'Siti Merah',
        latest_risk_badge: RiskBadge.MERAH,
        latest_aggregate_score: '75.00',
      }),
    );
  });

  it('uses a canonical cached snapshot without querying Prisma', async () => {
    const cached: BidanPatientItem[] = [
      {
        pregnancy_profile_id: '40000000-0000-4000-8000-000000000001',
        patient_name: 'Cached Patient',
        phone_number: '+6281410000001',
        hpl: '2026-10-08',
        gestational_week: 29,
        latest_risk_badge: RiskBadge.KUNING,
        latest_aggregate_score: '60.00',
        last_checkin_date: '2026-07-26',
        risk_factors: ['faktor'],
      },
    ];
    cache.get.mockResolvedValue(cached);

    await expect(
      service.getPatients(bidan, { limit: 20, offset: 0 }),
    ).resolves.toEqual({
      data: cached,
      total: 1,
      limit: 20,
      offset: 0,
    });
    expect(prisma.pregnancyProfile.findMany).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('lets admin read all regions while bypassing regional cache', async () => {
    prisma.pregnancyProfile.findMany.mockResolvedValue([]);

    await service.getPatients(admin, { limit: 20, offset: 0 });

    expect(prisma.pregnancyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: PregnancyStatus.HAMIL } }),
    );
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('rejects a bidan without puskesmas', async () => {
    await expect(
      service.getPatients(
        { ...bidan, puskesmas_id: null },
        { limit: 20, offset: 0 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('builds a deterministic local visit brief after profile access check', async () => {
    const profileId = '40000000-0000-4000-8000-000000000001';
    pregnancyProfilesService.findOne.mockResolvedValue({
      id: profileId,
      hpht: new Date('2026-01-01T00:00:00.000Z'),
      ended_at: null,
      user: { full_name: 'Siti Rahmawati' },
    });
    prisma.ancRecord.findFirst.mockResolvedValue({
      id: '50000000-0000-4000-8000-000000000001',
      systolic: 140,
      diastolic: 90,
      weight_kg: { toString: () => '65.50' },
      fundal_height_cm: { toString: () => '28.00' },
      protein_urine: 'positif',
      platelet_count: null,
      recorded_at: new Date('2026-07-25T08:00:00.000Z'),
    });
    prisma.riskAssessment.findFirst.mockResolvedValue({
      risk_badge: RiskBadge.KUNING,
      risk_factors: ['Tekanan darah tinggi'],
      recommendation_text: 'Kontrol ke bidan.',
    });
    prisma.symptomCheckin.findMany.mockResolvedValue([
      { answers: { sakit_kepala: 'berat', pandangan_kabur: false } },
    ]);
    prisma.postpartumLog.findMany.mockResolvedValue([]);

    const result = await service.getVisitBrief(profileId, bidan);

    expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
      profileId,
      bidan,
    );
    expect(result).toEqual(
      expect.objectContaining({
        patient_name: 'Siti Rahmawati',
        latest_risk_badge: RiskBadge.KUNING,
        vitals_summary:
          'TD 140/90 mmHg, BB 65.50 kg, TFU 28.00 cm, Protein urine positif',
        risk_factors: ['Tekanan darah tinggi'],
        recent_symptoms: ['sakit_kepala: berat', 'pandangan_kabur: false'],
        recommendation: 'Kontrol ke bidan.',
        last_visit_date: '2026-07-25',
      }),
    );
  });

  it('counts latest patient badges, nifas, and unique overdue profiles', async () => {
    const cached = [
      {
        pregnancy_profile_id: '40000000-0000-4000-8000-000000000001',
        patient_name: 'Merah',
        phone_number: '+6281',
        hpl: '2026-10-08',
        gestational_week: 29,
        latest_risk_badge: RiskBadge.MERAH,
        latest_aggregate_score: '80',
        last_checkin_date: null,
        risk_factors: [],
      },
      {
        pregnancy_profile_id: '40000000-0000-4000-8000-000000000002',
        patient_name: 'Belum Dinilai',
        phone_number: '+6282',
        hpl: '2026-10-08',
        gestational_week: 29,
        latest_risk_badge: null,
        latest_aggregate_score: null,
        last_checkin_date: null,
        risk_factors: [],
      },
    ] satisfies BidanPatientItem[];
    cache.get.mockResolvedValue(cached);
    prisma.pregnancyProfile.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    await expect(service.getStatistics(bidan)).resolves.toEqual({
      total_patients: 2,
      risk_distribution: { merah: 1, kuning: 0, hijau: 0 },
      overdue_checkins: 2,
      nifas_count: 1,
    });
    expect(prisma.pregnancyProfile.count).toHaveBeenNthCalledWith(1, {
      where: {
        user: { puskesmas_id: puskesmasId },
        status: PregnancyStatus.NIFAS,
      },
    });
    expect(prisma.pregnancyProfile.count).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          reminders: {
            some: {
              status: 'active',
              next_trigger_at: { lte: expect.any(Date) as Date },
            },
          },
        }),
      }),
    );
  });
});
