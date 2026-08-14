import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { UserRole } from '../common/constants/index.js';
import { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto.js';

const userProfileSelect = {
  id: true,
  role: true,
  full_name: true,
  phone_number: true,
  email: true,
  puskesmas_id: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByPhone(phone_number: string) {
    return this.prisma.user.findUnique({ where: { phone_number } });
  }

  findAuthUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, puskesmas_id: true, is_active: true },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userProfileSelect,
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    return user;
  }

  create(data: Prisma.UserUncheckedCreateInput) {
    return this.prisma.user.create({ data });
  }

  getProfile(userId: string) {
    return this.findById(userId);
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    await this.findById(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: userProfileSelect,
    });
  }

  async getUserDetail(id: string, requester: CurrentUserData) {
    const user = await this.findById(id);

    if (
      requester.role === UserRole.BIDAN &&
      (!requester.puskesmas_id || user.puskesmas_id !== requester.puskesmas_id)
    ) {
      throw new ForbiddenException('User berada di luar wilayah kerja');
    }

    return user;
  }

  async getAdminUsers(query: QueryAdminUsersDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role && { role: query.role }),
      ...(query.puskesmas_id && { puskesmas_id: query.puskesmas_id }),
      ...(query.search && {
        OR: ['full_name', 'phone_number', 'email'].map((field) => ({
          [field]: { contains: query.search, mode: 'insensitive' },
        })),
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        orderBy: [{ [query.sort]: query.direction }, { id: 'asc' }],
        select: {
          ...userProfileSelect,
          is_active: true,
          puskesmas: { select: { id: true, name: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, limit: query.limit, offset: query.offset };
  }
}
