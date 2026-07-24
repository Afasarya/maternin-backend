import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  PregnancyOutcome,
  PregnancyStatus,
  UserRole,
} from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { CreatePregnancyProfileDto } from './dto/create-pregnancy-profile.dto.js';
import { QueryPregnancyProfilesDto } from './dto/query-pregnancy-profiles.dto.js';
import { UpdatePregnancyProfileDto } from './dto/update-pregnancy-profile.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';

const profileUserSelect = {
  id: true,
  full_name: true,
  phone_number: true,
  puskesmas_id: true,
} satisfies Prisma.UserSelect;

type ProfileWithUser = Prisma.PregnancyProfileGetPayload<{
  include: { user: { select: typeof profileUserSelect } };
}>;

@Injectable()
export class PregnancyProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async create(
    dto: CreatePregnancyProfileDto,
    creatorId: string,
    creatorRole: UserRole,
    creatorPuskesmasId: string | null,
  ) {
    const userId = await this.resolveTargetUser(
      dto.user_id,
      creatorId,
      creatorRole,
      creatorPuskesmasId,
    );
    const hpht = this.toUtcDate(dto.hpht);
    const hpl = this.addDays(hpht, 280);

    return this.prisma.pregnancyProfile.create({
      data: {
        user_id: userId,
        hpht,
        hpl,
        gravida: dto.gravida,
        existing_conditions: dto.existing_conditions ?? [],
        had_preeclampsia_history: dto.had_preeclampsia_history ?? false,
      },
    });
  }

  async findAll(
    userId: string,
    role: UserRole,
    puskesmasId: string | null,
    filters: QueryPregnancyProfilesDto,
  ) {
    const where = this.buildListFilter(userId, role, puskesmasId, filters);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.pregnancyProfile.findMany({
        where,
        include: { user: { select: profileUserSelect } },
        skip: filters.offset,
        take: filters.limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.pregnancyProfile.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, requester?: CurrentUserData) {
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id },
      include: { user: { select: profileUserSelect } },
    });

    if (!profile) {
      throw new NotFoundException('Profil kehamilan tidak ditemukan');
    }

    if (requester) {
      await this.assertProfileAccess(profile, requester, false);
    }

    return profile;
  }

  async update(
    id: string,
    dto: UpdatePregnancyProfileDto,
    requester?: CurrentUserData,
  ) {
    await this.findOne(id, requester);
    const { hpht: hphtValue, ...otherFields } = dto;
    const hpht = hphtValue ? this.toUtcDate(hphtValue) : undefined;

    return this.prisma.pregnancyProfile.update({
      where: { id },
      data: {
        ...otherFields,
        ...(hpht && { hpht, hpl: this.addDays(hpht, 280) }),
      },
      include: { user: { select: profileUserSelect } },
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateStatusDto,
    requester?: CurrentUserData,
  ) {
    const profile = await this.findOne(id);
    const { status: newStatus, pregnancy_outcome: pregnancyOutcome } = dto;

    if (requester) {
      await this.assertProfileAccess(profile, requester, true);
    }

    if (
      newStatus !== PregnancyStatus.NIFAS &&
      newStatus !== PregnancyStatus.SELESAI
    ) {
      throw new BadRequestException(
        'Status hanya dapat diubah menjadi nifas atau selesai',
      );
    }

    if (profile.status === 'hamil') {
      return this.endPregnancy(id, newStatus, pregnancyOutcome);
    }

    if (profile.status !== 'nifas' || newStatus !== PregnancyStatus.SELESAI) {
      throw new BadRequestException(
        `Transisi status dari ${profile.status} ke ${newStatus} tidak valid`,
      );
    }

    if (pregnancyOutcome !== undefined) {
      throw new BadRequestException(
        'pregnancy_outcome hanya dapat ditetapkan saat kehamilan berakhir',
      );
    }

    return this.prisma.pregnancyProfile.update({
      where: { id },
      data: { status: PregnancyStatus.SELESAI },
      include: { user: { select: profileUserSelect } },
    });
  }

  async isOwner(profileId: string, userId: string): Promise<boolean> {
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: profileId },
      select: { user_id: true },
    });

    return profile?.user_id === userId;
  }

  private async resolveTargetUser(
    requestedUserId: string | undefined,
    creatorId: string,
    creatorRole: UserRole,
    creatorPuskesmasId: string | null,
  ) {
    if (creatorRole === UserRole.IBU_HAMIL) {
      return creatorId;
    }

    if (!requestedUserId) {
      throw new BadRequestException(
        'user_id wajib diisi oleh bidan atau kader',
      );
    }

    if (!creatorPuskesmasId) {
      throw new ForbiddenException(
        'Bidan atau kader belum terhubung ke puskesmas',
      );
    }

    const targetUser = await this.usersService.findById(requestedUserId);

    if (targetUser.role !== 'ibu_hamil') {
      throw new BadRequestException(
        'Profil kehamilan hanya dapat dibuat untuk ibu hamil',
      );
    }

    if (targetUser.puskesmas_id !== creatorPuskesmasId) {
      throw new ForbiddenException('User berada di luar wilayah kerja');
    }

    return requestedUserId;
  }

  private buildListFilter(
    userId: string,
    role: UserRole,
    puskesmasId: string | null,
    filters: QueryPregnancyProfilesDto,
  ): Prisma.PregnancyProfileWhereInput {
    const statusFilter = filters.status ? { status: filters.status } : {};

    if (role === UserRole.IBU_HAMIL) {
      return { user_id: userId, ...statusFilter };
    }

    if (role === UserRole.BIDAN) {
      if (!puskesmasId) {
        throw new ForbiddenException('Bidan belum terhubung ke puskesmas');
      }

      return {
        user: { puskesmas_id: puskesmasId },
        ...statusFilter,
      };
    }

    if (role === UserRole.ADMIN) {
      return statusFilter;
    }

    throw new ForbiddenException('Role tidak memiliki akses');
  }

  private async assertProfileAccess(
    profile: ProfileWithUser,
    requester: CurrentUserData,
    statusUpdate: boolean,
  ) {
    if (!statusUpdate && requester.role === UserRole.ADMIN) {
      return;
    }

    if (
      !statusUpdate &&
      requester.role === UserRole.IBU_HAMIL &&
      (await this.isOwner(profile.id, requester.id))
    ) {
      return;
    }

    const permittedStaffRole = statusUpdate
      ? requester.role === UserRole.BIDAN || requester.role === UserRole.KADER
      : requester.role === UserRole.BIDAN;

    if (
      permittedStaffRole &&
      requester.puskesmas_id &&
      profile.user.puskesmas_id === requester.puskesmas_id
    ) {
      return;
    }

    throw new ForbiddenException('Tidak memiliki akses ke profil kehamilan');
  }

  private endPregnancy(
    id: string,
    newStatus: PregnancyStatus.NIFAS | PregnancyStatus.SELESAI,
    pregnancyOutcome: PregnancyOutcome | undefined,
  ) {
    // TBD dr. Julian/nakes: no medical threshold is inferred here. For a
    // miscarriage, authorized staff explicitly chooses nifas or selesai.
    if (!pregnancyOutcome) {
      throw new BadRequestException(
        'pregnancy_outcome wajib diisi saat kehamilan berakhir',
      );
    }

    if (
      newStatus === PregnancyStatus.SELESAI &&
      pregnancyOutcome !== PregnancyOutcome.KEGUGURAN
    ) {
      throw new BadRequestException(
        'Transisi hamil ke selesai hanya berlaku untuk outcome keguguran',
      );
    }

    const now = new Date();

    return this.prisma.pregnancyProfile.update({
      where: { id },
      data: {
        status: newStatus,
        pregnancy_outcome: pregnancyOutcome,
        ended_at: now,
        ...(newStatus === PregnancyStatus.NIFAS && {
          nifas_start_date: now,
        }),
      },
      include: { user: { select: profileUserSelect } },
    });
  }

  private toUtcDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }
}
