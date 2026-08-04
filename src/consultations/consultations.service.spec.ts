import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, UserRole } from '../common/constants/index.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsultationsService } from './consultations.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));

describe('ConsultationsService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const patientId = '22222222-2222-4222-8222-222222222222';
  const consultationId = '33333333-3333-4333-8333-333333333333';
  const puskesmasId = '44444444-4444-4444-8444-444444444444';
  const owner = {
    id: patientId,
    role: UserRole.IBU_HAMIL,
    puskesmas_id: puskesmasId,
  };
  const profile = {
    id: profileId,
    user_id: patientId,
    user: { puskesmas_id: puskesmasId },
  };
  const consultation = {
    id: consultationId,
    pregnancy_profile_id: profileId,
    status: ConsultationStatus.OPEN,
    created_at: new Date('2026-07-29T08:00:00.000Z'),
    updated_at: new Date('2026-07-29T08:00:00.000Z'),
  };
  const prisma = {
    consultation: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const profiles = { findOne: jest.fn() };
  const service = new ConsultationsService(
    prisma as unknown as PrismaService,
    profiles as unknown as PregnancyProfilesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    profiles.findOne.mockResolvedValue(profile);
    prisma.consultation.create.mockResolvedValue(consultation);
    prisma.consultation.findMany.mockResolvedValue([consultation]);
    prisma.consultation.count.mockResolvedValue(1);
    prisma.consultation.findUnique.mockResolvedValue(consultation);
    prisma.consultation.update.mockResolvedValue({
      ...consultation,
      status: ConsultationStatus.CLOSED,
    });
    prisma.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );
  });

  it('creates an open consultation for the profile owner', async () => {
    await expect(
      service.create({ pregnancy_profile_id: profileId }, owner),
    ).resolves.toEqual(consultation);

    expect(profiles.findOne).toHaveBeenCalledWith(profileId);
    expect(prisma.consultation.create).toHaveBeenCalledWith({
      data: {
        pregnancy_profile_id: profileId,
        status: ConsultationStatus.OPEN,
      },
    });
  });

  it('rejects consultation creation by another patient', async () => {
    await expect(
      service.create(
        { pregnancy_profile_id: profileId },
        { ...owner, id: consultationId },
      ),
    ).rejects.toThrow(
      new ForbiddenException('Tidak memiliki akses untuk membuat konsultasi'),
    );
    expect(prisma.consultation.create).not.toHaveBeenCalled();
  });

  it('rejects direct service creation by non-patient roles', async () => {
    await expect(
      service.create(
        { pregnancy_profile_id: profileId },
        { id: patientId, role: UserRole.ADMIN, puskesmas_id: null },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists filtered consultations with pagination after access validation', async () => {
    await expect(
      service.findByProfile(
        profileId,
        { status: ConsultationStatus.OPEN, limit: 10, offset: 5 },
        owner,
      ),
    ).resolves.toEqual({ data: [consultation], total: 1 });

    expect(profiles.findOne).toHaveBeenCalledWith(profileId, owner);
    expect(prisma.consultation.findMany).toHaveBeenCalledWith({
      where: {
        pregnancy_profile_id: profileId,
        status: ConsultationStatus.OPEN,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 5,
      take: 10,
    });
  });

  it('propagates denial for an out-of-region bidan list', async () => {
    const bidan = {
      id: consultationId,
      role: UserRole.BIDAN,
      puskesmas_id: '55555555-5555-4555-8555-555555555555',
    };
    profiles.findOne.mockRejectedValue(
      new ForbiddenException('Tidak memiliki akses ke profil kehamilan'),
    );

    await expect(
      service.findByProfile(profileId, { limit: 20, offset: 0 }, bidan),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.consultation.findMany).not.toHaveBeenCalled();
  });

  it('returns detail after profile access validation', async () => {
    await expect(service.findOne(consultationId, owner)).resolves.toEqual(
      consultation,
    );
    expect(profiles.findOne).toHaveBeenCalledWith(profileId, owner);
  });

  it('throws when consultation does not exist', async () => {
    prisma.consultation.findUnique.mockResolvedValue(null);

    await expect(service.findOne(consultationId, owner)).rejects.toThrow(
      new NotFoundException('Konsultasi tidak ditemukan'),
    );
  });

  it('allows an in-region bidan to update consultation status', async () => {
    const bidan = {
      id: consultationId,
      role: UserRole.BIDAN,
      puskesmas_id: puskesmasId,
    };

    await expect(
      service.updateStatus(consultationId, ConsultationStatus.CLOSED, bidan),
    ).resolves.toEqual({
      ...consultation,
      status: ConsultationStatus.CLOSED,
    });
    expect(profiles.findOne).toHaveBeenCalledWith(profileId, bidan);
    expect(prisma.consultation.update).toHaveBeenCalledWith({
      where: { id: consultationId },
      data: { status: ConsultationStatus.CLOSED },
    });
  });

  it('allows admin to update without regional profile lookup', async () => {
    const admin = {
      id: consultationId,
      role: UserRole.ADMIN,
      puskesmas_id: null,
    };

    await service.updateStatus(
      consultationId,
      ConsultationStatus.CLOSED,
      admin,
    );
    expect(profiles.findOne).not.toHaveBeenCalled();
  });

  it('allows the owner to update their consultation status', async () => {
    await expect(
      service.updateStatus(consultationId, ConsultationStatus.CLOSED, owner),
    ).resolves.toEqual({
      ...consultation,
      status: ConsultationStatus.CLOSED,
    });
    expect(profiles.findOne).toHaveBeenCalledWith(profileId, owner);
  });
});
