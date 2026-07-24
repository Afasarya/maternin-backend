import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PregnancyOutcome,
  PregnancyStatus,
  UserRole,
} from '../common/constants/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { PregnancyProfilesService } from './pregnancy-profiles.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../users/users.service.js', () => ({
  UsersService: class UsersService {},
}));

describe('PregnancyProfilesService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const patientId = '22222222-2222-4222-8222-222222222222';
  const otherPatientId = '33333333-3333-4333-8333-333333333333';
  const staffId = '44444444-4444-4444-8444-444444444444';
  const puskesmasId = '55555555-5555-4555-8555-555555555555';
  const otherPuskesmasId = '66666666-6666-4666-8666-666666666666';
  const profileUserSelect = {
    id: true,
    full_name: true,
    phone_number: true,
    puskesmas_id: true,
  };
  const profile = {
    id: profileId,
    user_id: patientId,
    hpht: new Date('2026-07-01T00:00:00.000Z'),
    hpl: new Date('2027-04-07T00:00:00.000Z'),
    gravida: 1,
    existing_conditions: [],
    status: PregnancyStatus.HAMIL,
    pregnancy_outcome: null,
    ended_at: null,
    nifas_start_date: null,
    had_preeclampsia_history: false,
    created_at: new Date('2026-07-24T00:00:00.000Z'),
    updated_at: new Date('2026-07-24T00:00:00.000Z'),
    user: {
      id: patientId,
      full_name: 'Siti Rahmawati',
      phone_number: '+6281410000001',
      puskesmas_id: puskesmasId,
    },
  };
  const prisma = {
    pregnancyProfile: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const usersService = {
    findById: jest.fn(),
  };
  const service = new PregnancyProfilesService(
    prisma as unknown as PrismaService,
    usersService as unknown as UsersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );
  });

  describe('create', () => {
    it('forces an ibu_hamil profile to use the creator id', async () => {
      prisma.pregnancyProfile.create.mockResolvedValue(profile);

      await service.create(
        {
          user_id: otherPatientId,
          hpht: '2026-07-01',
          gravida: 1,
        },
        patientId,
        UserRole.IBU_HAMIL,
        puskesmasId,
      );

      expect(usersService.findById).not.toHaveBeenCalled();
      expect(prisma.pregnancyProfile.create).toHaveBeenCalledWith({
        data: {
          user_id: patientId,
          hpht: new Date('2026-07-01T00:00:00.000Z'),
          hpl: new Date('2027-04-07T00:00:00.000Z'),
          gravida: 1,
          existing_conditions: [],
          had_preeclampsia_history: false,
        },
      });
    });

    it('allows a bidan to create a profile for a patient in their region', async () => {
      usersService.findById.mockResolvedValue({
        id: patientId,
        role: UserRole.IBU_HAMIL,
        puskesmas_id: puskesmasId,
      });
      prisma.pregnancyProfile.create.mockResolvedValue(profile);

      await service.create(
        {
          user_id: patientId,
          hpht: '2026-07-01',
          gravida: 2,
          existing_conditions: ['anemia'],
          had_preeclampsia_history: true,
        },
        staffId,
        UserRole.BIDAN,
        puskesmasId,
      );

      expect(usersService.findById).toHaveBeenCalledWith(patientId);
      expect(prisma.pregnancyProfile.create).toHaveBeenCalledWith({
        data: {
          user_id: patientId,
          hpht: new Date('2026-07-01T00:00:00.000Z'),
          hpl: new Date('2027-04-07T00:00:00.000Z'),
          gravida: 2,
          existing_conditions: ['anemia'],
          had_preeclampsia_history: true,
        },
      });
    });

    it('requires user_id when a bidan or kader creates a profile', async () => {
      await expect(
        service.create(
          { hpht: '2026-07-01', gravida: 1 },
          staffId,
          UserRole.KADER,
          puskesmasId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.pregnancyProfile.create).not.toHaveBeenCalled();
    });

    it('prevents staff from creating a profile outside their region', async () => {
      usersService.findById.mockResolvedValue({
        id: otherPatientId,
        role: UserRole.IBU_HAMIL,
        puskesmas_id: otherPuskesmasId,
      });

      await expect(
        service.create(
          {
            user_id: otherPatientId,
            hpht: '2026-07-01',
            gravida: 1,
          },
          staffId,
          UserRole.BIDAN,
          puskesmasId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('limits an ibu_hamil list to their own profiles', async () => {
      prisma.pregnancyProfile.findMany.mockResolvedValue([profile]);
      prisma.pregnancyProfile.count.mockResolvedValue(1);

      await expect(
        service.findAll(patientId, UserRole.IBU_HAMIL, puskesmasId, {
          status: PregnancyStatus.HAMIL,
          limit: 10,
          offset: 5,
        }),
      ).resolves.toEqual({ data: [profile], total: 1 });

      const where = {
        user_id: patientId,
        status: PregnancyStatus.HAMIL,
      };
      expect(prisma.pregnancyProfile.findMany).toHaveBeenCalledWith({
        where,
        include: { user: { select: profileUserSelect } },
        skip: 5,
        take: 10,
        orderBy: { created_at: 'desc' },
      });
      expect(prisma.pregnancyProfile.count).toHaveBeenCalledWith({ where });
    });

    it('limits a bidan list to patients in their puskesmas', async () => {
      prisma.pregnancyProfile.findMany.mockResolvedValue([profile]);
      prisma.pregnancyProfile.count.mockResolvedValue(1);

      await service.findAll(staffId, UserRole.BIDAN, puskesmasId, {
        limit: 20,
        offset: 0,
      });

      const where = { user: { puskesmas_id: puskesmasId } };
      expect(prisma.pregnancyProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      expect(prisma.pregnancyProfile.count).toHaveBeenCalledWith({ where });
    });
  });

  describe('findOne and update', () => {
    it('throws when the profile does not exist', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue(null);

      await expect(service.findOne(profileId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows only the owner to read their profile', async () => {
      prisma.pregnancyProfile.findUnique
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce({ user_id: patientId });

      await expect(
        service.findOne(profileId, {
          id: patientId,
          role: UserRole.IBU_HAMIL,
          puskesmas_id: puskesmasId,
        }),
      ).resolves.toEqual(profile);

      expect(prisma.pregnancyProfile.findUnique).toHaveBeenLastCalledWith({
        where: { id: profileId },
        select: { user_id: true },
      });
    });

    it('rejects a different ibu_hamil owner', async () => {
      prisma.pregnancyProfile.findUnique
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce({ user_id: patientId });

      await expect(
        service.findOne(profileId, {
          id: otherPatientId,
          role: UserRole.IBU_HAMIL,
          puskesmas_id: puskesmasId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('recomputes HPL when HPHT is updated', async () => {
      prisma.pregnancyProfile.findUnique
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce({ user_id: patientId });
      prisma.pregnancyProfile.update.mockResolvedValue({
        ...profile,
        hpht: new Date('2026-08-01T00:00:00.000Z'),
        hpl: new Date('2027-05-08T00:00:00.000Z'),
      });

      await service.update(
        profileId,
        { hpht: '2026-08-01', existing_conditions: ['hipertensi'] },
        {
          id: patientId,
          role: UserRole.IBU_HAMIL,
          puskesmas_id: puskesmasId,
        },
      );

      expect(prisma.pregnancyProfile.update).toHaveBeenCalledWith({
        where: { id: profileId },
        data: {
          existing_conditions: ['hipertensi'],
          hpht: new Date('2026-08-01T00:00:00.000Z'),
          hpl: new Date('2027-05-08T00:00:00.000Z'),
        },
        include: { user: { select: profileUserSelect } },
      });
    });
  });

  describe('updateStatus', () => {
    it('changes hamil to nifas with persalinan outcome', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue(profile);
      prisma.pregnancyProfile.update.mockResolvedValue({
        ...profile,
        status: PregnancyStatus.NIFAS,
        pregnancy_outcome: PregnancyOutcome.PERSALINAN,
        ended_at: new Date(),
        nifas_start_date: new Date(),
      });

      await service.updateStatus(
        profileId,
        {
          status: PregnancyStatus.NIFAS,
          pregnancy_outcome: PregnancyOutcome.PERSALINAN,
        },
        {
          id: staffId,
          role: UserRole.BIDAN,
          puskesmas_id: puskesmasId,
        },
      );

      expect(prisma.pregnancyProfile.update).toHaveBeenCalledWith({
        where: { id: profileId },
        data: {
          status: PregnancyStatus.NIFAS,
          pregnancy_outcome: PregnancyOutcome.PERSALINAN,
          ended_at: expect.any(Date) as Date,
          nifas_start_date: expect.any(Date) as Date,
        },
        include: { user: { select: profileUserSelect } },
      });
    });

    it('allows explicit hamil to nifas for keguguran without inferring a medical threshold', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue(profile);
      prisma.pregnancyProfile.update.mockResolvedValue({
        ...profile,
        status: PregnancyStatus.NIFAS,
        pregnancy_outcome: PregnancyOutcome.KEGUGURAN,
        ended_at: new Date(),
        nifas_start_date: new Date(),
      });

      await service.updateStatus(
        profileId,
        {
          status: PregnancyStatus.NIFAS,
          pregnancy_outcome: PregnancyOutcome.KEGUGURAN,
        },
        {
          id: staffId,
          role: UserRole.BIDAN,
          puskesmas_id: puskesmasId,
        },
      );

      expect(prisma.pregnancyProfile.update).toHaveBeenCalledWith({
        where: { id: profileId },
        data: {
          status: PregnancyStatus.NIFAS,
          pregnancy_outcome: PregnancyOutcome.KEGUGURAN,
          ended_at: expect.any(Date) as Date,
          nifas_start_date: expect.any(Date) as Date,
        },
        include: { user: { select: profileUserSelect } },
      });
    });

    it('allows explicit hamil to selesai for keguguran', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue(profile);
      prisma.pregnancyProfile.update.mockResolvedValue({
        ...profile,
        status: PregnancyStatus.SELESAI,
        pregnancy_outcome: PregnancyOutcome.KEGUGURAN,
        ended_at: new Date(),
      });

      await service.updateStatus(
        profileId,
        {
          status: PregnancyStatus.SELESAI,
          pregnancy_outcome: PregnancyOutcome.KEGUGURAN,
        },
        {
          id: staffId,
          role: UserRole.BIDAN,
          puskesmas_id: puskesmasId,
        },
      );

      expect(prisma.pregnancyProfile.update).toHaveBeenCalledWith({
        where: { id: profileId },
        data: {
          status: PregnancyStatus.SELESAI,
          pregnancy_outcome: PregnancyOutcome.KEGUGURAN,
          ended_at: expect.any(Date) as Date,
        },
        include: { user: { select: profileUserSelect } },
      });
    });

    it('requires an outcome when leaving hamil status', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue(profile);

      await expect(
        service.updateStatus(
          profileId,
          { status: PregnancyStatus.NIFAS },
          {
            id: staffId,
            role: UserRole.BIDAN,
            puskesmas_id: puskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.pregnancyProfile.update).not.toHaveBeenCalled();
    });

    it('rejects direct hamil to selesai for persalinan', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue(profile);

      await expect(
        service.updateStatus(
          profileId,
          {
            status: PregnancyStatus.SELESAI,
            pregnancy_outcome: PregnancyOutcome.PERSALINAN,
          },
          {
            id: staffId,
            role: UserRole.BIDAN,
            puskesmas_id: puskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.pregnancyProfile.update).not.toHaveBeenCalled();
    });

    it('changes nifas to selesai without replacing nifas_start_date', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue({
        ...profile,
        status: PregnancyStatus.NIFAS,
        nifas_start_date: new Date('2026-07-24T00:00:00.000Z'),
      });
      prisma.pregnancyProfile.update.mockResolvedValue({
        ...profile,
        status: PregnancyStatus.SELESAI,
      });

      await service.updateStatus(
        profileId,
        { status: PregnancyStatus.SELESAI },
        {
          id: staffId,
          role: UserRole.KADER,
          puskesmas_id: puskesmasId,
        },
      );

      expect(prisma.pregnancyProfile.update).toHaveBeenCalledWith({
        where: { id: profileId },
        data: { status: PregnancyStatus.SELESAI },
        include: { user: { select: profileUserSelect } },
      });
    });

    it('rejects changing pregnancy outcome when nifas becomes selesai', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue({
        ...profile,
        status: PregnancyStatus.NIFAS,
        pregnancy_outcome: PregnancyOutcome.KEGUGURAN,
        ended_at: new Date('2026-07-24T00:00:00.000Z'),
        nifas_start_date: new Date('2026-07-24T00:00:00.000Z'),
      });

      await expect(
        service.updateStatus(
          profileId,
          {
            status: PregnancyStatus.SELESAI,
            pregnancy_outcome: PregnancyOutcome.PERSALINAN,
          },
          {
            id: staffId,
            role: UserRole.BIDAN,
            puskesmas_id: puskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.pregnancyProfile.update).not.toHaveBeenCalled();
    });

    it('rejects the illegal selesai to hamil transition', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue({
        ...profile,
        status: PregnancyStatus.SELESAI,
      });

      await expect(
        service.updateStatus(
          profileId,
          { status: PregnancyStatus.HAMIL },
          {
            id: staffId,
            role: UserRole.BIDAN,
            puskesmas_id: puskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.pregnancyProfile.update).not.toHaveBeenCalled();
    });

    it('rejects a kader outside the patient region', async () => {
      prisma.pregnancyProfile.findUnique.mockResolvedValue(profile);

      await expect(
        service.updateStatus(
          profileId,
          {
            status: PregnancyStatus.NIFAS,
            pregnancy_outcome: PregnancyOutcome.PERSALINAN,
          },
          {
            id: staffId,
            role: UserRole.KADER,
            puskesmas_id: otherPuskesmasId,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
