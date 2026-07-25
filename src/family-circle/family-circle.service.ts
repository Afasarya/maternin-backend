import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { NotifyOn, RiskBadge, UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateFamilyCircleDto } from './dto/create-family-circle.dto.js';
import { UpdateFamilyCircleDto } from './dto/update-family-circle.dto.js';

interface Pagination {
  limit: number;
  offset: number;
}

@Injectable()
export class FamilyCircleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
  ) {}

  async create(dto: CreateFamilyCircleDto, requester: CurrentUserData) {
    await this.assertOwner(dto.pregnancy_profile_id, requester);

    return this.prisma.familyCircle.create({
      data: {
        pregnancy_profile_id: dto.pregnancy_profile_id,
        contact_name: dto.contact_name,
        contact_phone: dto.contact_phone,
        relation: dto.relation,
        notify_on: dto.notify_on,
      },
    });
  }

  async findByProfile(
    profileId: string,
    pagination: Pagination,
    requester: CurrentUserData,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const where = { pregnancy_profile_id: profileId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.familyCircle.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.familyCircle.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester: CurrentUserData) {
    const contact = await this.findContact(id);

    if (requester.role === UserRole.ADMIN) {
      return contact;
    }

    await this.assertOwner(contact.pregnancy_profile_id, requester);
    return contact;
  }

  async update(
    id: string,
    dto: UpdateFamilyCircleDto,
    requester: CurrentUserData,
  ) {
    const contact = await this.findContact(id);
    await this.assertOwner(contact.pregnancy_profile_id, requester);

    return this.prisma.familyCircle.update({
      where: { id },
      data: {
        contact_name: dto.contact_name,
        contact_phone: dto.contact_phone,
        relation: dto.relation,
        notify_on: dto.notify_on,
      },
    });
  }

  async remove(id: string, requester: CurrentUserData) {
    const contact = await this.findContact(id);
    await this.assertOwner(contact.pregnancy_profile_id, requester);

    return this.prisma.familyCircle.delete({ where: { id } });
  }

  findContactsForNotification(profileId: string, riskBadge: RiskBadge) {
    const where: Prisma.FamilyCircleWhereInput = {
      pregnancy_profile_id: profileId,
    };

    if (riskBadge !== RiskBadge.MERAH) {
      where.notify_on = NotifyOn.SEMUA_PERUBAHAN;
    }

    return this.prisma.familyCircle.findMany({ where });
  }

  private async findContact(id: string) {
    const contact = await this.prisma.familyCircle.findUnique({
      where: { id },
    });

    if (!contact) {
      throw new NotFoundException('Kontak family circle tidak ditemukan');
    }

    return contact;
  }

  private async assertOwner(
    profileId: string,
    requester: CurrentUserData,
  ): Promise<void> {
    const profile = await this.pregnancyProfilesService.findOne(profileId);

    if (
      requester.role !== UserRole.IBU_HAMIL ||
      profile.user_id !== requester.id
    ) {
      throw new ForbiddenException('Tidak memiliki akses ke family circle');
    }
  }
}
