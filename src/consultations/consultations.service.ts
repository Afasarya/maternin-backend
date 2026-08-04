import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { ConsultationStatus, UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateConsultationDto } from './dto/create-consultation.dto.js';

interface ConsultationFilters {
  status?: ConsultationStatus;
  limit: number;
  offset: number;
}

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
  ) {}

  async create(dto: CreateConsultationDto, requester: CurrentUserData) {
    const profile = await this.pregnancyProfilesService.findOne(
      dto.pregnancy_profile_id,
    );

    if (
      requester.role !== UserRole.IBU_HAMIL ||
      profile.user_id !== requester.id
    ) {
      throw new ForbiddenException(
        'Tidak memiliki akses untuk membuat konsultasi',
      );
    }

    return this.prisma.consultation.create({
      data: {
        pregnancy_profile_id: dto.pregnancy_profile_id,
        status: ConsultationStatus.OPEN,
      },
    });
  }

  async findByProfile(
    profileId: string,
    filters: ConsultationFilters,
    requester: CurrentUserData,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const where: Prisma.ConsultationWhereInput = {
      pregnancy_profile_id: profileId,
      ...(filters.status && { status: filters.status }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.consultation.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: filters.offset,
        take: filters.limit,
      }),
      this.prisma.consultation.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester: CurrentUserData) {
    const consultation = await this.findConsultation(id);

    await this.pregnancyProfilesService.findOne(
      consultation.pregnancy_profile_id,
      requester,
    );
    return consultation;
  }

  async updateStatus(
    id: string,
    status: ConsultationStatus,
    requester: CurrentUserData,
  ) {
    const consultation = await this.findConsultation(id);

    if (
      requester.role === UserRole.IBU_HAMIL ||
      requester.role === UserRole.BIDAN
    ) {
      await this.pregnancyProfilesService.findOne(
        consultation.pregnancy_profile_id,
        requester,
      );
    } else if (requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Tidak memiliki akses untuk mengubah status konsultasi',
      );
    }

    return this.prisma.consultation.update({
      where: { id },
      data: { status },
    });
  }

  private async findConsultation(id: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
    });

    if (!consultation) {
      throw new NotFoundException('Konsultasi tidak ditemukan');
    }

    return consultation;
  }
}
