import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AncSource, UserRole } from '../common/constants/index.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AncRecordsService } from './anc-records.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));

describe('AncRecordsService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const otherProfileId = '22222222-2222-4222-8222-222222222222';
  const patientId = '33333333-3333-4333-8333-333333333333';
  const otherPatientId = '44444444-4444-4444-8444-444444444444';
  const staffId = '55555555-5555-4555-8555-555555555555';
  const recordId = '66666666-6666-4666-8666-666666666666';
  const clientUuid = '77777777-7777-4777-8777-777777777777';
  const puskesmasId = '88888888-8888-4888-8888-888888888888';
  const otherPuskesmasId = '99999999-9999-4999-8999-999999999999';
  const profile = {
    id: profileId,
    user_id: patientId,
    user: { puskesmas_id: puskesmasId },
  };
  const record = {
    id: recordId,
    pregnancy_profile_id: profileId,
    recorded_by_user_id: patientId,
    source: AncSource.SELF,
    systolic: 120,
    diastolic: 80,
    weight_kg: 55,
    fundal_height_cm: null,
    protein_urine: null,
    platelet_count: null,
    recorded_at: new Date('2026-07-24T08:00:00.000Z'),
    client_uuid: clientUuid,
    created_at: new Date('2026-07-24T08:00:00.000Z'),
  };
  const prisma = {
    ancRecord: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const pregnancyProfilesService = {
    findOne: jest.fn(),
  };
  const service = new AncRecordsService(
    prisma as unknown as PrismaService,
    pregnancyProfilesService as unknown as PregnancyProfilesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    pregnancyProfilesService.findOne.mockResolvedValue(profile);
    prisma.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );
  });

  describe('create', () => {
    it('creates self input for the profile owner', async () => {
      prisma.ancRecord.create.mockResolvedValue(record);

      await service.create(
        {
          pregnancy_profile_id: profileId,
          systolic: 120,
          diastolic: 80,
          weight_kg: 55,
          recorded_at: '2026-07-24T08:00:00.000Z',
        },
        {
          id: patientId,
          role: UserRole.IBU_HAMIL,
          puskesmas_id: puskesmasId,
        },
      );

      expect(prisma.ancRecord.create).toHaveBeenCalledWith({
        data: {
          pregnancy_profile_id: profileId,
          recorded_by_user_id: patientId,
          source: AncSource.SELF,
          systolic: 120,
          diastolic: 80,
          weight_kg: 55,
          fundal_height_cm: undefined,
          protein_urine: undefined,
          platelet_count: undefined,
          recorded_at: new Date('2026-07-24T08:00:00.000Z'),
          client_uuid: undefined,
        },
      });
    });

    it('creates nakes input for a bidan in the patient region', async () => {
      prisma.ancRecord.create.mockResolvedValue({
        ...record,
        recorded_by_user_id: staffId,
        source: AncSource.NAKES,
      });

      await service.create(
        {
          pregnancy_profile_id: profileId,
          systolic: 135,
          diastolic: 88,
          fundal_height_cm: 24,
          protein_urine: 'negatif',
          platelet_count: 250000,
          recorded_at: '2026-07-24T09:00:00.000Z',
        },
        {
          id: staffId,
          role: UserRole.BIDAN,
          puskesmas_id: puskesmasId,
        },
      );

      expect(prisma.ancRecord.create).toHaveBeenCalledWith({
        data: {
          pregnancy_profile_id: profileId,
          recorded_by_user_id: staffId,
          source: AncSource.NAKES,
          systolic: 135,
          diastolic: 88,
          weight_kg: undefined,
          fundal_height_cm: 24,
          protein_urine: 'negatif',
          platelet_count: 250000,
          recorded_at: new Date('2026-07-24T09:00:00.000Z'),
          client_uuid: undefined,
        },
      });
    });

    it('creates kader_offline input for a kader in the patient region', async () => {
      prisma.ancRecord.create.mockResolvedValue({
        ...record,
        recorded_by_user_id: staffId,
        source: AncSource.KADER_OFFLINE,
      });

      await service.create(
        {
          pregnancy_profile_id: profileId,
          recorded_at: '2026-07-24T10:00:00.000Z',
          client_uuid: clientUuid,
        },
        {
          id: staffId,
          role: UserRole.KADER,
          puskesmas_id: puskesmasId,
        },
      );

      expect(prisma.ancRecord.create).toHaveBeenCalledWith({
        data: {
          pregnancy_profile_id: profileId,
          recorded_by_user_id: staffId,
          source: AncSource.KADER_OFFLINE,
          systolic: undefined,
          diastolic: undefined,
          weight_kg: undefined,
          fundal_height_cm: undefined,
          protein_urine: undefined,
          platelet_count: undefined,
          recorded_at: new Date('2026-07-24T10:00:00.000Z'),
          client_uuid: clientUuid,
        },
      });
    });

    it('returns the existing record for a repeated client_uuid', async () => {
      prisma.ancRecord.findFirst.mockResolvedValue(record);

      await expect(
        service.create(
          { pregnancy_profile_id: profileId, client_uuid: clientUuid },
          {
            id: patientId,
            role: UserRole.IBU_HAMIL,
            puskesmas_id: puskesmasId,
          },
        ),
      ).resolves.toEqual(record);

      expect(prisma.ancRecord.findFirst).toHaveBeenCalledWith({
        where: { client_uuid: clientUuid },
      });
      expect(prisma.ancRecord.create).not.toHaveBeenCalled();
    });

    it('rejects a client_uuid already assigned to another profile', async () => {
      prisma.ancRecord.findFirst.mockResolvedValue({
        ...record,
        pregnancy_profile_id: otherProfileId,
      });

      await expect(
        service.create(
          { pregnancy_profile_id: profileId, client_uuid: clientUuid },
          {
            id: patientId,
            role: UserRole.IBU_HAMIL,
            puskesmas_id: puskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns the winner when concurrent requests race on client_uuid', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        clientVersion: '7.9.0',
      });
      prisma.ancRecord.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(record);
      prisma.ancRecord.create.mockRejectedValue(uniqueError);

      await expect(
        service.create(
          { pregnancy_profile_id: profileId, client_uuid: clientUuid },
          {
            id: patientId,
            role: UserRole.IBU_HAMIL,
            puskesmas_id: puskesmasId,
          },
        ),
      ).resolves.toEqual(record);

      expect(prisma.ancRecord.findFirst).toHaveBeenCalledTimes(2);
    });

    it('rejects a concurrent client_uuid winner from another profile', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        clientVersion: '7.9.0',
      });
      prisma.ancRecord.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...record,
          pregnancy_profile_id: otherProfileId,
        });
      prisma.ancRecord.create.mockRejectedValue(uniqueError);

      await expect(
        service.create(
          { pregnancy_profile_id: profileId, client_uuid: clientUuid },
          {
            id: patientId,
            role: UserRole.IBU_HAMIL,
            puskesmas_id: puskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an ibu_hamil writing to another patient profile', async () => {
      await expect(
        service.create(
          { pregnancy_profile_id: profileId },
          {
            id: otherPatientId,
            role: UserRole.IBU_HAMIL,
            puskesmas_id: puskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.ancRecord.create).not.toHaveBeenCalled();
    });

    it('rejects staff writing outside their region', async () => {
      await expect(
        service.create(
          { pregnancy_profile_id: profileId },
          {
            id: staffId,
            role: UserRole.BIDAN,
            puskesmas_id: otherPuskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('read', () => {
    it('lists records with pagination and newest-first sorting', async () => {
      prisma.ancRecord.findMany.mockResolvedValue([record]);
      prisma.ancRecord.count.mockResolvedValue(1);

      await expect(
        service.findByProfile(
          profileId,
          { limit: 10, offset: 5 },
          {
            id: patientId,
            role: UserRole.IBU_HAMIL,
            puskesmas_id: puskesmasId,
          },
        ),
      ).resolves.toEqual({ data: [record], total: 1 });

      const where = { pregnancy_profile_id: profileId };
      expect(prisma.ancRecord.findMany).toHaveBeenCalledWith({
        where,
        orderBy: { recorded_at: 'desc' },
        skip: 5,
        take: 10,
      });
      expect(prisma.ancRecord.count).toHaveBeenCalledWith({ where });
    });

    it('returns the latest record for an authorized bidan', async () => {
      prisma.ancRecord.findFirst.mockResolvedValue(record);

      await expect(
        service.findLatest(profileId, {
          id: staffId,
          role: UserRole.BIDAN,
          puskesmas_id: puskesmasId,
        }),
      ).resolves.toEqual(record);

      expect(prisma.ancRecord.findFirst).toHaveBeenCalledWith({
        where: { pregnancy_profile_id: profileId },
        orderBy: { recorded_at: 'desc' },
      });
    });

    it('returns null when no latest record exists', async () => {
      prisma.ancRecord.findFirst.mockResolvedValue(null);

      await expect(
        service.findLatest(profileId, {
          id: patientId,
          role: UserRole.IBU_HAMIL,
          puskesmas_id: puskesmasId,
        }),
      ).resolves.toBeNull();
    });

    it('supports internal latest lookup without exposing a controller role', async () => {
      prisma.ancRecord.findFirst.mockResolvedValue(record);

      await expect(service.findLatest(profileId)).resolves.toEqual(record);

      expect(pregnancyProfilesService.findOne).not.toHaveBeenCalled();
      expect(prisma.ancRecord.findFirst).toHaveBeenCalledWith({
        where: { pregnancy_profile_id: profileId },
        orderBy: { recorded_at: 'desc' },
      });
    });

    it('returns one record after checking its profile access', async () => {
      prisma.ancRecord.findUnique.mockResolvedValue(record);

      await expect(
        service.findOne(recordId, {
          id: patientId,
          role: UserRole.IBU_HAMIL,
          puskesmas_id: puskesmasId,
        }),
      ).resolves.toEqual(record);

      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(profileId);
    });

    it('throws when one record does not exist', async () => {
      prisma.ancRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(recordId, {
          id: patientId,
          role: UserRole.IBU_HAMIL,
          puskesmas_id: puskesmasId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a different ibu_hamil reading records', async () => {
      await expect(
        service.findByProfile(
          profileId,
          { limit: 20, offset: 0 },
          {
            id: otherPatientId,
            role: UserRole.IBU_HAMIL,
            puskesmas_id: puskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects kader read access to sensitive ANC data', async () => {
      await expect(
        service.findLatest(profileId, {
          id: staffId,
          role: UserRole.KADER,
          puskesmas_id: puskesmasId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows admin read access', async () => {
      prisma.ancRecord.findMany.mockResolvedValue([record]);
      prisma.ancRecord.count.mockResolvedValue(1);

      await expect(
        service.findByProfile(
          profileId,
          { limit: 20, offset: 0 },
          {
            id: staffId,
            role: UserRole.ADMIN,
            puskesmas_id: null,
          },
        ),
      ).resolves.toEqual({ data: [record], total: 1 });
    });
  });
});
