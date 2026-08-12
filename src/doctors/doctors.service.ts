import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client.js';
import { UserRole } from '../common/constants/index.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}
  findAll(specialization?: string) {
    return this.prisma.doctor.findMany({
      where: {
        is_active: true,
        ...(specialization && {
          specialization: { contains: specialization, mode: 'insensitive' },
        }),
      },
      include: { user: { select: { full_name: true } }, schedules: true },
      orderBy: { created_at: 'desc' },
    });
  }
  async findOne(id: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, is_active: true },
      include: { user: { select: { full_name: true } }, schedules: true },
    });
    if (!doctor) throw new NotFoundException('Dokter tidak ditemukan');
    const bookings = await this.prisma.consultation.findMany({
      where: {
        doctor_id: id,
        scheduled_at: { gte: new Date() },
        status: { notIn: ['cancelled', 'expired'] },
      },
      select: { scheduled_at: true },
    });
    return { ...doctor, booked_slots: bookings.map((x) => x.scheduled_at) };
  }
  async create(dto: {
    full_name: string;
    phone_number: string;
    email?: string;
    password: string;
    specialization: string;
    str_number?: string;
    price: number;
    bio?: string;
  }) {
    if (dto.price < 0) throw new BadRequestException('Harga tidak valid');
    const exists = await this.prisma.user.findUnique({
      where: { phone_number: dto.phone_number },
    });
    if (exists) throw new ConflictException('Nomor telepon sudah terdaftar');
    const password_hash = await bcrypt.hash(dto.password, 12);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          full_name: dto.full_name,
          phone_number: dto.phone_number,
          email: dto.email,
          password_hash,
          role: UserRole.DOKTER,
        },
      });
      return tx.doctor.create({
        data: {
          user_id: user.id,
          specialization: dto.specialization,
          str_number: dto.str_number,
          price: dto.price,
          bio: dto.bio,
        },
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              phone_number: true,
              email: true,
              role: true,
            },
          },
        },
      });
    });
  }
  async update(id: string, dto: Prisma.DoctorUpdateInput) {
    await this.findDoctor(id);
    const { full_name, phone_number, email, ...doctorData } = dto as Prisma.DoctorUpdateInput & { full_name?: string; phone_number?: string; email?: string };
    return this.prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.update({ where: { id }, data: doctorData });
      if (full_name !== undefined || phone_number !== undefined || email !== undefined) {
        await tx.user.update({ where: { id: doctor.user_id }, data: { full_name, phone_number, email } });
      }
      return tx.doctor.findUnique({ where: { id }, include: { user: { select: { id: true, full_name: true, phone_number: true, email: true } } } });
    });
  }
  async findAllAdmin(query: { search?: string; specialization?: string; is_active?: boolean; limit: number; offset: number; sort: string; direction: 'asc' | 'desc' }) {
    const where: Prisma.DoctorWhereInput = {
      ...(query.is_active !== undefined && { is_active: query.is_active }),
      ...(query.specialization && { specialization: { contains: query.specialization, mode: 'insensitive' } }),
      ...(query.search && { OR: [
        { specialization: { contains: query.search, mode: 'insensitive' } },
        { user: { full_name: { contains: query.search, mode: 'insensitive' } } },
      ] }),
    };
    const orderBy = query.sort === 'full_name' ? { user: { full_name: query.direction } } : { [query.sort]: query.direction };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({ where, skip: query.offset, take: query.limit, orderBy: [orderBy, { id: 'asc' }], include: { user: { select: { full_name: true, phone_number: true, email: true } }, _count: { select: { schedules: true } } } }),
      this.prisma.doctor.count({ where }),
    ]);
    return { data: rows.map(({ user, _count, ...row }) => ({ ...row, ...user, price: row.price.toString(), schedule_count: _count.schedules })), total, limit: query.limit, offset: query.offset };
  }
  async findByUser(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { user_id: userId },
    });
    if (!doctor) throw new NotFoundException('Profil dokter tidak ditemukan');
    return doctor;
  }
  private async findDoctor(id: string) {
    const row = await this.prisma.doctor.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Dokter tidak ditemukan');
    return row;
  }
}
