import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RiskBadge, UserRole } from '../common/constants/index.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { RiskAssessmentsCacheService } from './risk-assessments-cache.service.js';
import { RiskAssessmentsService } from './risk-assessments.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));

jest.mock('./risk-assessments-cache.service.js', () => ({
  RiskAssessmentsCacheService: class RiskAssessmentsCacheService {},
}));

jest.mock('../reminders/reminders.service.js', () => ({
  RemindersService: class RemindersService {},
}));

describe('RiskAssessmentsService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const checkinId = '22222222-2222-4222-8222-222222222222';
  const assessmentId = '33333333-3333-4333-8333-333333333333';
  const patientId = '44444444-4444-4444-8444-444444444444';
  const puskesmasId = '55555555-5555-4555-8555-555555555555';
  const requester = {
    id: patientId,
    role: UserRole.IBU_HAMIL,
    puskesmas_id: puskesmasId,
  };
  const adminRequester = {
    id: '66666666-6666-4666-8666-666666666666',
    role: UserRole.ADMIN,
    puskesmas_id: null,
  };
  const assessment = {
    id: assessmentId,
    pregnancy_profile_id: profileId,
    symptom_checkin_id: checkinId,
    triage_score: 84,
    anemia_probability: 0.3,
    preeclampsia_probability: 0.8,
    aggregate_score: 84,
    risk_badge: RiskBadge.MERAH,
    risk_factors: ['Tekanan darah tinggi'],
    recommendation_text: 'Segera ke fasilitas kesehatan',
    created_at: new Date('2026-07-24T10:00:00.000Z'),
  };
  const callbackDto = {
    pregnancy_profile_id: profileId,
    symptom_checkin_id: checkinId,
    triage_score: 75,
    anemia_probability: 0.3,
    preeclampsia_probability: 0.8,
    aggregate_score: 84,
    risk_badge: RiskBadge.MERAH,
    risk_factors: ['Tekanan darah tinggi'],
    recommendation_text: 'Segera ke fasilitas kesehatan',
  };
  const prisma = {
    pregnancyProfile: {
      findUnique: jest.fn(),
    },
    symptomCheckin: {
      findUnique: jest.fn(),
    },
    riskAssessment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const pregnancyProfilesService = {
    findOne: jest.fn(),
  };
  const cache = {
    get: jest.fn(),
    getVersion: jest.fn(),
    setIfVersion: jest.fn(),
    invalidate: jest.fn(),
  };
  const remindersService = {
    updateCadenceOnNewAssessment: jest.fn(),
  };
  const service = new RiskAssessmentsService(
    prisma as unknown as PrismaService,
    pregnancyProfilesService as unknown as PregnancyProfilesService,
    cache as unknown as RiskAssessmentsCacheService,
    remindersService as unknown as RemindersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    pregnancyProfilesService.findOne.mockResolvedValue({
      id: profileId,
      user_id: patientId,
      user: { puskesmas_id: puskesmasId },
    });
    prisma.pregnancyProfile.findUnique.mockResolvedValue({
      user: { puskesmas_id: puskesmasId },
    });
    prisma.symptomCheckin.findUnique.mockResolvedValue({
      pregnancy_profile_id: profileId,
    });
    prisma.riskAssessment.findFirst.mockResolvedValue(null);
    prisma.riskAssessment.create.mockResolvedValue(assessment);
    remindersService.updateCadenceOnNewAssessment.mockResolvedValue({
      count: 1,
    });
    cache.getVersion.mockResolvedValue('0');
    cache.setIfVersion.mockResolvedValue(true);
    prisma.$transaction.mockImplementation(
      async (
        input:
          | Array<Promise<unknown>>
          | ((transaction: typeof prisma) => Promise<unknown>),
      ) => (typeof input === 'function' ? input(prisma) : Promise.all(input)),
    );
  });

  describe('create', () => {
    it.each([RiskBadge.MERAH, RiskBadge.KUNING, RiskBadge.HIJAU])(
      'persists %s callback and updates ANC cadence',
      async (badge) => {
        jest
          .useFakeTimers()
          .setSystemTime(new Date('2026-07-24T10:00:00.000Z'));
        prisma.riskAssessment.create.mockResolvedValue({
          ...assessment,
          risk_badge: badge,
        });

        try {
          await expect(
            service.createFromCallback({ ...callbackDto, risk_badge: badge }),
          ).resolves.toEqual({
            assessment: { ...assessment, risk_badge: badge },
            created: true,
          });

          expect(prisma.riskAssessment.create).toHaveBeenCalledWith({
            data: {
              pregnancy_profile_id: profileId,
              symptom_checkin_id: checkinId,
              triage_score: 75,
              anemia_probability: 0.3,
              preeclampsia_probability: 0.8,
              aggregate_score: 84,
              risk_badge: badge,
              risk_factors: ['Tekanan darah tinggi'],
              recommendation_text: 'Segera ke fasilitas kesehatan',
            },
          });
          expect(
            remindersService.updateCadenceOnNewAssessment,
          ).toHaveBeenCalledWith(profileId, badge, prisma);
          expect(cache.invalidate).toHaveBeenCalledWith(
            `risk:latest:version:${profileId}`,
            `risk:latest:${profileId}`,
            `bidan:patients:${puskesmasId}`,
          );
        } finally {
          jest.useRealTimers();
        }
      },
    );

    it('persists a successful synchronous AI response', async () => {
      prisma.riskAssessment.findFirst.mockResolvedValue(null);

      await expect(
        service.createFromAiResponse(profileId, checkinId, {
          risk_badge: RiskBadge.MERAH,
          aggregate_score: 84,
          risk_factors: ['Tekanan darah tinggi'],
          recommendation_text: 'Segera ke fasilitas kesehatan',
        }),
      ).resolves.toEqual(assessment);

      expect(prisma.riskAssessment.create).toHaveBeenCalledWith({
        data: {
          pregnancy_profile_id: profileId,
          symptom_checkin_id: checkinId,
          triage_score: 84,
          anemia_probability: undefined,
          preeclampsia_probability: undefined,
          aggregate_score: 84,
          risk_badge: RiskBadge.MERAH,
          risk_factors: ['Tekanan darah tinggi'],
          recommendation_text: 'Segera ke fasilitas kesehatan',
        },
      });
    });

    it('returns an existing check-in assessment without duplication', async () => {
      prisma.riskAssessment.findFirst.mockResolvedValue(assessment);

      await expect(
        service.createFromAiResponse(profileId, checkinId, {
          risk_badge: RiskBadge.MERAH,
          aggregate_score: 84,
          risk_factors: [],
          recommendation_text: 'Rekomendasi',
        }),
      ).resolves.toEqual(assessment);

      expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
      expect(cache.invalidate).toHaveBeenCalledWith(
        `risk:latest:version:${profileId}`,
        `risk:latest:${profileId}`,
        `bidan:patients:${puskesmasId}`,
      );
    });

    it('returns an idempotent callback replay without duplication', async () => {
      prisma.riskAssessment.findFirst.mockResolvedValue(assessment);

      await expect(service.createFromCallback(callbackDto)).resolves.toEqual({
        assessment,
        created: false,
      });

      expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
      expect(
        remindersService.updateCadenceOnNewAssessment,
      ).not.toHaveBeenCalled();
    });

    it('returns the concurrent unique-constraint winner', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      prisma.riskAssessment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(assessment);
      prisma.$transaction.mockRejectedValue(uniqueError);

      await expect(service.createFromCallback(callbackDto)).resolves.toEqual({
        assessment,
        created: false,
      });

      expect(cache.invalidate).toHaveBeenCalledWith(
        `risk:latest:version:${profileId}`,
        `risk:latest:${profileId}`,
        `bidan:patients:${puskesmasId}`,
      );
    });

    it('rejects a missing pregnancy profile', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.createFromCallback(callbackDto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
    });

    it('rejects a symptom check-in from another profile', async () => {
      prisma.symptomCheckin.findUnique.mockResolvedValue({
        pregnancy_profile_id: '66666666-6666-4666-8666-666666666666',
      });

      await expect(
        service.createFromCallback(callbackDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
    });
  });

  describe('read', () => {
    it('lists assessments newest first with pagination', async () => {
      prisma.riskAssessment.findMany.mockResolvedValue([assessment]);
      prisma.riskAssessment.count.mockResolvedValue(1);

      await expect(
        service.findByProfile(profileId, { limit: 10, offset: 5 }, requester),
      ).resolves.toEqual({ data: [assessment], total: 1 });

      const where = { pregnancy_profile_id: profileId };
      expect(prisma.riskAssessment.findMany).toHaveBeenCalledWith({
        where,
        orderBy: { created_at: 'desc' },
        skip: 5,
        take: 10,
      });
      expect(prisma.riskAssessment.count).toHaveBeenCalledWith({ where });
      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        profileId,
        requester,
      );
    });

    it('allows admin to list assessments through full profile access', async () => {
      prisma.riskAssessment.findMany.mockResolvedValue([assessment]);
      prisma.riskAssessment.count.mockResolvedValue(1);

      await expect(
        service.findByProfile(
          profileId,
          { limit: 20, offset: 0 },
          adminRequester,
        ),
      ).resolves.toEqual({ data: [assessment], total: 1 });

      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        profileId,
        adminRequester,
      );
    });

    it('returns one assessment after profile access validation', async () => {
      prisma.riskAssessment.findUnique.mockResolvedValue(assessment);

      await expect(service.findOne(assessmentId, requester)).resolves.toEqual(
        assessment,
      );
      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        profileId,
        requester,
      );
    });

    it('rejects access denied by the pregnancy profile scope', async () => {
      prisma.riskAssessment.findUnique.mockResolvedValue(assessment);
      pregnancyProfilesService.findOne.mockRejectedValue(
        new ForbiddenException('Tidak memiliki akses ke profil kehamilan'),
      );

      await expect(
        service.findOne(assessmentId, requester),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns latest assessment from cache without a database query', async () => {
      cache.get.mockResolvedValue(assessment);

      await expect(service.findLatest(profileId, requester)).resolves.toEqual(
        assessment,
      );
      expect(cache.get).toHaveBeenCalledWith(`risk:latest:${profileId}`);
      expect(prisma.riskAssessment.findFirst).not.toHaveBeenCalled();
    });

    it('queries and caches latest assessment for ten minutes on a miss', async () => {
      cache.get.mockResolvedValue(null);
      cache.getVersion.mockResolvedValue('7');
      prisma.riskAssessment.findFirst.mockResolvedValue(assessment);

      await expect(service.findLatest(profileId, requester)).resolves.toEqual(
        assessment,
      );
      expect(prisma.riskAssessment.findFirst).toHaveBeenCalledWith({
        where: { pregnancy_profile_id: profileId },
        orderBy: { created_at: 'desc' },
      });
      expect(cache.setIfVersion).toHaveBeenCalledWith(
        `risk:latest:${profileId}`,
        assessment,
        600,
        `risk:latest:version:${profileId}`,
        '7',
      );
    });

    it('allows admin to read latest through full profile access', async () => {
      cache.get.mockResolvedValue(assessment);

      await expect(
        service.findLatest(profileId, adminRequester),
      ).resolves.toEqual(assessment);
      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        profileId,
        adminRequester,
      );
    });

    it.each([
      [
        'another patient',
        {
          id: '77777777-7777-4777-8777-777777777777',
          role: UserRole.IBU_HAMIL,
          puskesmas_id: puskesmasId,
        },
      ],
      [
        'a midwife from another puskesmas',
        {
          id: '88888888-8888-4888-8888-888888888888',
          role: UserRole.BIDAN,
          puskesmas_id: '99999999-9999-4999-8999-999999999999',
        },
      ],
    ])('rejects latest access for %s', async (_label, deniedRequester) => {
      pregnancyProfilesService.findOne.mockRejectedValue(
        new ForbiddenException('Tidak memiliki akses ke profil kehamilan'),
      );

      await expect(
        service.findLatest(profileId, deniedRequester),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('does not cache a database result when Redis version is unavailable', async () => {
      cache.get.mockResolvedValue(null);
      cache.getVersion.mockResolvedValue(null);
      prisma.riskAssessment.findFirst.mockResolvedValue(assessment);

      await expect(service.findLatest(profileId, requester)).resolves.toEqual(
        assessment,
      );
      expect(cache.setIfVersion).not.toHaveBeenCalled();
    });
  });
});
