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
  async findAll(specialization?: string) {
    const rows = await this.prisma.doctor.findMany({
      where: {
        is_active: true,
        ...(specialization && {
          specialization: { contains: specialization, mode: 'insensitive' },
        }),
      },
      include: { user: { select: { full_name: true } }, schedules: true },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => this.normalize(row));
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
    return this.normalize({
      ...doctor,
      booked_slots: bookings.map((x) => x.scheduled_at),
    });
  }
  async availableSlots(id: string, dateFrom?: string, dateTo?: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, is_active: true },
      include: { schedules: true },
    });
    if (!doctor) throw new NotFoundException('Dokter tidak ditemukan');

    const today = this.jakartaDate(new Date());
    const from = dateFrom ?? today;
    const to = dateTo ?? this.addDays(today, 13);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      throw new BadRequestException('Rentang tanggal tidak valid');
    if (from < today || to < from || this.daysBetween(from, to) > 30)
      throw new BadRequestException('Rentang tanggal harus hari ini hingga maksimal 31 hari');

    const start = this.jakartaInstant(from, '00:00');
    const end = this.jakartaInstant(this.addDays(to, 1), '00:00');
    const bookings = await this.prisma.consultation.findMany({
      where: {
        doctor_id: id,
        scheduled_at: { gte: start, lt: end },
        status: { in: ['pending_payment', 'scheduled', 'ongoing'] },
      },
      select: { scheduled_at: true },
    });
    const occupied = new Set(bookings.map((x) => x.scheduled_at.toISOString()));
    const slots: Array<{ scheduled_at: string; local_date: string; local_time: string }> = [];
    for (let date = from; date <= to; date = this.addDays(date, 1)) {
      const day = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'][
        this.jakartaInstant(date, '12:00').getUTCDay()
      ];
      for (const schedule of doctor.schedules.filter((x) => x.day_of_week === day)) {
        for (let minute = this.toMinutes(schedule.start_time); minute + 30 <= this.toMinutes(schedule.end_time); minute += 30) {
          const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
          const instant = this.jakartaInstant(date, time);
          if (instant > new Date() && !occupied.has(instant.toISOString()))
            slots.push({ scheduled_at: instant.toISOString(), local_date: date, local_time: time });
        }
      }
    }
    return { doctor_id: id, timezone: 'Asia/Jakarta', duration_minutes: 30, date_from: from, date_to: to, slots };
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
    const { full_name, phone_number, email, ...doctorData } =
      dto as Prisma.DoctorUpdateInput & {
        full_name?: string;
        phone_number?: string;
        email?: string;
      };
    return this.prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.update({
        where: { id },
        data: doctorData,
      });
      if (
        full_name !== undefined ||
        phone_number !== undefined ||
        email !== undefined
      ) {
        await tx.user.update({
          where: { id: doctor.user_id },
          data: { full_name, phone_number, email },
        });
      }
      return tx.doctor.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              phone_number: true,
              email: true,
            },
          },
        },
      });
    });
  }
  async findAllAdmin(query: {
    search?: string;
    specialization?: string;
    is_active?: boolean;
    limit: number;
    offset: number;
    sort: string;
    direction: 'asc' | 'desc';
  }) {
    const where: Prisma.DoctorWhereInput = {
      ...(query.is_active !== undefined && { is_active: query.is_active }),
      ...(query.specialization && {
        specialization: { contains: query.specialization, mode: 'insensitive' },
      }),
      ...(query.search && {
        OR: [
          { specialization: { contains: query.search, mode: 'insensitive' } },
          {
            user: {
              full_name: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };
    const orderBy =
      query.sort === 'full_name'
        ? { user: { full_name: query.direction } }
        : { [query.sort]: query.direction };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        orderBy: [orderBy, { id: 'asc' }],
        include: {
          user: {
            select: { full_name: true, phone_number: true, email: true },
          },
          _count: { select: { schedules: true } },
        },
      }),
      this.prisma.doctor.count({ where }),
    ]);
    return {
      data: rows.map(({ user, _count, ...row }) => ({
        ...row,
        ...user,
        price: row.price.toString(),
        schedule_count: _count.schedules,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    };
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
  private normalize<T extends { price: { toString(): string }; user?: { full_name: string }; schedules?: unknown[] }>(row: T) {
    const { user, ...doctor } = row;
    return { ...doctor, full_name: user?.full_name, price: row.price.toString(), schedules: row.schedules ?? [] };
  }
  private jakartaDate(date: Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  private jakartaInstant(date: string, time: string) {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
  }
  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }
  private daysBetween(from: string, to: string) {
    return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  }
  private toMinutes(time: string) {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match) throw new BadRequestException('Format jadwal dokter tidak valid');
    return Number(match[1]) * 60 + Number(match[2]);
  }
}
