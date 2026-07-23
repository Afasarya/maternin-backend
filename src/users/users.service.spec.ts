import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../common/constants/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

describe('UsersService', () => {
  const safeSelect = {
    id: true,
    role: true,
    full_name: true,
    phone_number: true,
    email: true,
    puskesmas_id: true,
    created_at: true,
    updated_at: true,
  };
  const profile = {
    id: '11111111-1111-4111-8111-111111111111',
    role: 'ibu_hamil',
    full_name: 'Siti Aminah',
    phone_number: '+6281234567890',
    email: 'siti@example.com',
    puskesmas_id: '22222222-2222-4222-8222-222222222222',
    created_at: new Date(),
    updated_at: new Date(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('returns a profile without selecting password_hash', async () => {
    prisma.user.findUnique.mockResolvedValue(profile);

    await expect(service.getProfile(profile.id)).resolves.toEqual(profile);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: profile.id },
      select: safeSelect,
    });
  });

  it('throws when a user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getProfile(profile.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('prevents a bidan from reading users outside their puskesmas', async () => {
    prisma.user.findUnique.mockResolvedValue(profile);

    await expect(
      service.getUserDetail(profile.id, {
        id: '33333333-3333-4333-8333-333333333333',
        role: UserRole.BIDAN,
        puskesmas_id: '44444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates only the profile DTO fields and returns the safe projection', async () => {
    prisma.user.findUnique.mockResolvedValue(profile);
    prisma.user.update.mockResolvedValue({
      ...profile,
      full_name: 'Siti Baru',
    });

    await service.updateProfile(profile.id, { full_name: 'Siti Baru' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: { full_name: 'Siti Baru' },
      select: safeSelect,
    });
  });
});
