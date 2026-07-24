import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AncRecord } from '../../generated/prisma/client.js';
import { AncSource, UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAncRecordDto } from './dto/create-anc-record.dto.js';

interface Pagination {
  limit: number;
  offset: number;
}

interface PrismaKnownRequestError {
  code: string;
  clientVersion: string;
}

export interface CreateAncRecordResult {
  record: AncRecord;
  created: boolean;
}

const isUniqueConstraintError = (
  error: unknown,
): error is PrismaKnownRequestError => {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & Partial<PrismaKnownRequestError>;

  return (
    candidate.code === 'P2002' && typeof candidate.clientVersion === 'string'
  );
};

@Injectable()
export class AncRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
  ) {}

  async create(
    dto: CreateAncRecordDto,
    requester: CurrentUserData,
  ): Promise<CreateAncRecordResult> {
    await this.assertProfileAccess(dto.pregnancy_profile_id, requester, true);

    if (dto.client_uuid) {
      const existing = await this.prisma.ancRecord.findFirst({
        where: { client_uuid: dto.client_uuid },
      });

      if (existing) {
        if (existing.pregnancy_profile_id !== dto.pregnancy_profile_id) {
          throw new ConflictException(
            'client_uuid sudah digunakan untuk profil kehamilan lain',
          );
        }

        return { record: existing, created: false };
      }
    }

    try {
      const record = await this.prisma.ancRecord.create({
        data: {
          pregnancy_profile_id: dto.pregnancy_profile_id,
          recorded_by_user_id: requester.id,
          source: this.resolveSource(requester.role),
          systolic: dto.systolic,
          diastolic: dto.diastolic,
          weight_kg: dto.weight_kg,
          fundal_height_cm: dto.fundal_height_cm,
          protein_urine: dto.protein_urine,
          platelet_count: dto.platelet_count,
          recorded_at: dto.recorded_at ? new Date(dto.recorded_at) : new Date(),
          client_uuid: dto.client_uuid,
        },
      });

      return { record, created: true };
    } catch (error: unknown) {
      if (dto.client_uuid && isUniqueConstraintError(error)) {
        const existing = await this.prisma.ancRecord.findFirst({
          where: { client_uuid: dto.client_uuid },
        });

        if (existing?.pregnancy_profile_id === dto.pregnancy_profile_id) {
          return { record: existing, created: false };
        }

        if (existing) {
          throw new ConflictException(
            'client_uuid sudah digunakan untuk profil kehamilan lain',
          );
        }
      }

      throw error;
    }
  }

  async findByProfile(
    profileId: string,
    pagination: Pagination,
    requester: CurrentUserData,
  ) {
    await this.assertProfileAccess(profileId, requester, false);
    const where = { pregnancy_profile_id: profileId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ancRecord.findMany({
        where,
        orderBy: { recorded_at: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.ancRecord.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester: CurrentUserData) {
    const record = await this.prisma.ancRecord.findUnique({ where: { id } });

    if (!record) {
      throw new NotFoundException('Catatan ANC tidak ditemukan');
    }

    await this.assertProfileAccess(
      record.pregnancy_profile_id,
      requester,
      false,
    );

    return record;
  }

  async findLatest(profileId: string, requester?: CurrentUserData) {
    if (requester) {
      await this.assertProfileAccess(profileId, requester, false);
    }

    return this.prisma.ancRecord.findFirst({
      where: { pregnancy_profile_id: profileId },
      orderBy: { recorded_at: 'desc' },
    });
  }

  private async assertProfileAccess(
    profileId: string,
    requester: CurrentUserData,
    writeAccess: boolean,
  ) {
    const profile = await this.pregnancyProfilesService.findOne(profileId);

    if (
      requester.role === UserRole.IBU_HAMIL &&
      profile.user_id === requester.id
    ) {
      return;
    }

    if (!writeAccess && requester.role === UserRole.ADMIN) {
      return;
    }

    const permittedStaffRole = writeAccess
      ? requester.role === UserRole.BIDAN || requester.role === UserRole.KADER
      : requester.role === UserRole.BIDAN;

    if (
      permittedStaffRole &&
      requester.puskesmas_id &&
      profile.user.puskesmas_id === requester.puskesmas_id
    ) {
      return;
    }

    throw new ForbiddenException('Tidak memiliki akses ke catatan ANC');
  }

  private resolveSource(role: UserRole) {
    if (role === UserRole.IBU_HAMIL) {
      return AncSource.SELF;
    }

    if (role === UserRole.BIDAN) {
      return AncSource.NAKES;
    }

    if (role === UserRole.KADER) {
      return AncSource.KADER_OFFLINE;
    }

    throw new ForbiddenException('Role tidak dapat membuat catatan ANC');
  }
}
