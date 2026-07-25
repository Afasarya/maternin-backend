import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotifyOn, RiskBadge, UserRole } from '../common/constants/index.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FamilyCircleService } from './family-circle.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));

describe('FamilyCircleService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const patientId = '22222222-2222-4222-8222-222222222222';
  const otherPatientId = '33333333-3333-4333-8333-333333333333';
  const contactId = '44444444-4444-4444-8444-444444444444';
  const puskesmasId = '55555555-5555-4555-8555-555555555555';
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
  const createDto = {
    pregnancy_profile_id: profileId,
    contact_name: 'Budi Santoso',
    contact_phone: '+628123456789',
    relation: 'suami',
    notify_on: NotifyOn.SEMUA_PERUBAHAN,
  };
  const contact = {
    id: contactId,
    ...createDto,
    created_at: new Date('2026-07-25T10:00:00.000Z'),
  };
  const redOnlyContact = {
    ...contact,
    id: '66666666-6666-4666-8666-666666666666',
    notify_on: NotifyOn.MERAH_ONLY,
  };
  const prisma = {
    familyCircle: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const pregnancyProfilesService = {
    findOne: jest.fn(),
  };
  const service = new FamilyCircleService(
    prisma as unknown as PrismaService,
    pregnancyProfilesService as unknown as PregnancyProfilesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    pregnancyProfilesService.findOne.mockResolvedValue(profile);
    prisma.familyCircle.create.mockResolvedValue(contact);
    prisma.familyCircle.findUnique.mockResolvedValue(contact);
    prisma.familyCircle.findMany.mockResolvedValue([contact]);
    prisma.familyCircle.count.mockResolvedValue(1);
    prisma.familyCircle.update.mockResolvedValue(contact);
    prisma.familyCircle.delete.mockResolvedValue(contact);
    prisma.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );
  });

  it('creates a contact for the profile owner', async () => {
    await expect(service.create(createDto, owner)).resolves.toEqual(contact);

    expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(profileId);
    expect(prisma.familyCircle.create).toHaveBeenCalledWith({
      data: createDto,
    });
  });

  it('rejects creation for a profile owned by another patient', async () => {
    const requester = { ...owner, id: otherPatientId };

    await expect(service.create(createDto, requester)).rejects.toThrow(
      new ForbiddenException('Tidak memiliki akses ke family circle'),
    );
    expect(prisma.familyCircle.create).not.toHaveBeenCalled();
  });

  it('rejects service-level creation by a non-patient role', async () => {
    const requester = {
      id: patientId,
      role: UserRole.ADMIN,
      puskesmas_id: null,
    };

    await expect(service.create(createDto, requester)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lists contacts with pagination after profile access validation', async () => {
    await expect(
      service.findByProfile(profileId, { limit: 10, offset: 5 }, owner),
    ).resolves.toEqual({ data: [contact], total: 1 });

    expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
      profileId,
      owner,
    );
    expect(prisma.familyCircle.findMany).toHaveBeenCalledWith({
      where: { pregnancy_profile_id: profileId },
      orderBy: { created_at: 'desc' },
      skip: 5,
      take: 10,
    });
    expect(prisma.familyCircle.count).toHaveBeenCalledWith({
      where: { pregnancy_profile_id: profileId },
    });
  });

  it('propagates access denial for an out-of-region bidan list', async () => {
    const requester = {
      id: otherPatientId,
      role: UserRole.BIDAN,
      puskesmas_id: '77777777-7777-4777-8777-777777777777',
    };
    pregnancyProfilesService.findOne.mockRejectedValue(
      new ForbiddenException('Tidak memiliki akses ke profil kehamilan'),
    );

    await expect(
      service.findByProfile(profileId, { limit: 20, offset: 0 }, requester),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.familyCircle.findMany).not.toHaveBeenCalled();
  });

  it('returns contact detail to its owner', async () => {
    await expect(service.findOne(contactId, owner)).resolves.toEqual(contact);

    expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(profileId);
  });

  it('returns contact detail to admin without owner validation', async () => {
    const admin = {
      id: otherPatientId,
      role: UserRole.ADMIN,
      puskesmas_id: null,
    };

    await expect(service.findOne(contactId, admin)).resolves.toEqual(contact);
    expect(pregnancyProfilesService.findOne).not.toHaveBeenCalled();
  });

  it('throws when a contact does not exist', async () => {
    prisma.familyCircle.findUnique.mockResolvedValue(null);

    await expect(service.findOne(contactId, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates only mutable contact fields for the owner', async () => {
    const dto = {
      contact_phone: '+628987654321',
      notify_on: NotifyOn.MERAH_ONLY,
    };
    const updated = { ...contact, ...dto };
    prisma.familyCircle.update.mockResolvedValue(updated);

    await expect(service.update(contactId, dto, owner)).resolves.toEqual(
      updated,
    );
    expect(prisma.familyCircle.update).toHaveBeenCalledWith({
      where: { id: contactId },
      data: {
        contact_name: undefined,
        contact_phone: dto.contact_phone,
        relation: undefined,
        notify_on: dto.notify_on,
      },
    });
  });

  it('rejects update by a non-owner', async () => {
    await expect(
      service.update(
        contactId,
        { contact_name: 'Nama Baru' },
        {
          ...owner,
          id: otherPatientId,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.familyCircle.update).not.toHaveBeenCalled();
  });

  it('hard-deletes a contact owned by the requester', async () => {
    await expect(service.remove(contactId, owner)).resolves.toEqual(contact);

    expect(prisma.familyCircle.delete).toHaveBeenCalledWith({
      where: { id: contactId },
    });
  });

  it('rejects deletion by a non-owner', async () => {
    await expect(
      service.remove(contactId, { ...owner, id: otherPatientId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.familyCircle.delete).not.toHaveBeenCalled();
  });

  it('returns every contact for red risk notifications', async () => {
    prisma.familyCircle.findMany.mockResolvedValue([contact, redOnlyContact]);

    await expect(
      service.findContactsForNotification(profileId, RiskBadge.MERAH),
    ).resolves.toEqual([contact, redOnlyContact]);
    expect(prisma.familyCircle.findMany).toHaveBeenCalledWith({
      where: { pregnancy_profile_id: profileId },
    });
  });

  it.each([RiskBadge.HIJAU, RiskBadge.KUNING])(
    'returns only semua_perubahan contacts for %s risk',
    async (riskBadge) => {
      await service.findContactsForNotification(profileId, riskBadge);

      expect(prisma.familyCircle.findMany).toHaveBeenCalledWith({
        where: {
          pregnancy_profile_id: profileId,
          notify_on: NotifyOn.SEMUA_PERUBAHAN,
        },
      });
    },
  );
});
