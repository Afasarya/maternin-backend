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
}
