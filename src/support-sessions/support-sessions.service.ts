import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { SupportSessionStatus, UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SupportSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: PregnancyProfilesService,
  ) {}
  async create(profileId: string, user: CurrentUserData) {
    const profile = await this.profiles.findOne(profileId);
    if (user.role !== UserRole.IBU_HAMIL || profile.user_id !== user.id)
      throw new ForbiddenException(
        'Tidak memiliki akses untuk membuat sesi dukungan',
      );
    return this.prisma.supportSession.create({
      data: { pregnancy_profile_id: profileId },
    });
  }
  async findAll(
    profileId: string,
    status: SupportSessionStatus | undefined,
    limit: number,
    offset: number,
    user: CurrentUserData,
  ) {
    await this.profiles.findOne(profileId, user);
    const where: Prisma.SupportSessionWhereInput = {
      pregnancy_profile_id: profileId,
      ...(status && { status }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supportSession.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.supportSession.count({ where }),
    ]);
    return { data, total };
  }
  async findOne(id: string, user: CurrentUserData) {
    const row = await this.prisma.supportSession.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Sesi dukungan tidak ditemukan');
    await this.profiles.findOne(row.pregnancy_profile_id, user);
    return row;
  }
  async update(
    id: string,
    status: SupportSessionStatus,
    user: CurrentUserData,
  ) {
    await this.findOne(id, user);
    return this.prisma.supportSession.update({
      where: { id },
      data: { status },
    });
  }
}
