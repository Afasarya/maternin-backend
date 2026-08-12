import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '../../generated/prisma/client.js';
import { ConsultationStatus as PrismaConsultationStatus } from '../../generated/prisma/enums.js';
import {
  ConsultationSenderType,
  ConsultationStatus,
  UserRole,
} from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { BidanService } from '../bidan/bidan.service.js';
import { DoctorsService } from '../doctors/doctors.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const dayNames = [
  'minggu',
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
  'sabtu',
] as const;
@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly doctors: DoctorsService,
    private readonly bidan: BidanService,
  ) {}
  async create(
    dto: {
      pregnancy_profile_id: string;
      doctor_id: string;
      scheduled_at: string;
    },
    user: CurrentUserData,
  ) {
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: dto.pregnancy_profile_id },
    });
    if (!profile)
      throw new NotFoundException('Profil kehamilan tidak ditemukan');
    if (profile.user_id !== user.id)
      throw new ForbiddenException('Profil kehamilan bukan milik pengguna');
    const doctor = await this.doctors.findOne(dto.doctor_id);
    const scheduled = new Date(dto.scheduled_at);
    if (Number.isNaN(scheduled.getTime()) || scheduled <= new Date())
      throw new BadRequestException('Jadwal konsultasi tidak valid');
    const hhmm = scheduled.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const dow =
      dayNames[
        Number(
          new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Jakarta',
            weekday: 'short',
          })
            .formatToParts(scheduled)
            .find((x) => x.type === 'weekday')
            ? scheduled.toLocaleString('en-US', {
                timeZone: 'Asia/Jakarta',
                weekday: 'short',
              }) === 'Sun'
              ? 0
              : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
                  scheduled.toLocaleString('en-US', {
                    timeZone: 'Asia/Jakarta',
                    weekday: 'short',
                  }),
                ) + 1
            : scheduled.getUTCDay(),
        )
      ];
    if (
      !doctor.schedules.some(
        (s) =>
          s.day_of_week === dow && s.start_time <= hhmm && s.end_time > hhmm,
      )
    )
      throw new BadRequestException('Jadwal di luar ketersediaan dokter');
    const clash = await this.prisma.consultation.findFirst({
      where: {
        doctor_id: dto.doctor_id,
        scheduled_at: scheduled,
        status: {
          notIn: [ConsultationStatus.CANCELLED, ConsultationStatus.EXPIRED],
        },
      },
    });
    if (clash) throw new ConflictException('Slot konsultasi sudah dibooking');
    const fee = new Prisma.Decimal(
      this.config.getOrThrow<string>('CONSULTATION_PLATFORM_FEE'),
    );
    const total = doctor.price.add(fee);
    const consultation = await this.prisma.consultation.create({
      data: {
        pregnancy_profile_id: dto.pregnancy_profile_id,
        doctor_id: dto.doctor_id,
        scheduled_at: scheduled,
        price_snapshot: doctor.price,
        platform_fee: fee,
      },
    });
    try {
      const key = this.config.getOrThrow<string>('XENDIT_SECRET_KEY');
      const response = await firstValueFrom(
        this.http.post(
          'https://api.xendit.co/v2/invoices',
          {
            external_id: consultation.id,
            amount: total.toNumber(),
            invoice_duration: 3600,
            description: `Konsultasi dokter ${consultation.id}`,
          },
          { auth: { username: key, password: '' } },
        ),
      );
      const invoice = response.data as { id: string; invoice_url: string };
      await this.prisma.payment.create({
        data: {
          consultation_id: consultation.id,
          xendit_invoice_id: invoice.id,
          amount: total,
        },
      });
      return {
        ...consultation,
        payment_url: invoice.invoice_url,
        total_amount: total,
      };
    } catch (error) {
      await this.prisma.consultation.delete({ where: { id: consultation.id } });
      throw new BadRequestException('Gagal membuat invoice pembayaran', {
        cause: error,
      });
    }
  }
  async listPatient(
    status: ConsultationStatus | undefined,
    user: CurrentUserData,
  ) {
    return this.prisma.consultation.findMany({
      where: {
        pregnancy_profile: { user_id: user.id },
        ...(status && { status }),
      },
      include: {
        doctor: { include: { user: { select: { full_name: true } } } },
        payment: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }
  async listDoctor(
    user: CurrentUserData,
    query: {
      status?: ConsultationStatus;
      date_from?: string;
      date_to?: string;
      limit: number;
      offset: number;
    },
  ) {
    const doctor = await this.doctors.findByUser(user.id);
    const where: Prisma.ConsultationWhereInput = {
      doctor_id: doctor.id,
      ...(query.status && { status: query.status }),
      ...this.dateScope(query),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.consultation.findMany({
        where,
        include: {
          pregnancy_profile: {
            select: { user: { select: { full_name: true } } },
          },
          payment: { select: { status: true, amount: true, paid_at: true } },
        },
        orderBy: [{ scheduled_at: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.consultation.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.serializeConsultation(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }
  async listAdmin(query: { status?: ConsultationStatus; doctor_id?: string; payment_status?: string; date_from?: string; date_to?: string; search?: string; limit: number; offset: number }) {
    const where: Prisma.ConsultationWhereInput = { ...(query.status && { status: query.status }), ...(query.doctor_id && { doctor_id: query.doctor_id }), ...(query.payment_status && { payment: { status: query.payment_status as never } }), ...this.dateScope(query), ...(query.search && { OR: [{ doctor: { user: { full_name: { contains: query.search, mode: 'insensitive' } } } }, { pregnancy_profile: { user: { full_name: { contains: query.search, mode: 'insensitive' } } } }] }) };
    const [rows, total] = await this.prisma.$transaction([this.prisma.consultation.findMany({
      where,
      include: {
        doctor: { include: { user: { select: { full_name: true } } } },
        pregnancy_profile: { select: { user: { select: { full_name: true } } } },
        payment: true,
      },
      orderBy: { created_at: 'desc' },
      skip: query.offset, take: query.limit,
    }), this.prisma.consultation.count({ where })]);
    return { data: rows.map((row) => this.serializeConsultation(row)), total, limit: query.limit, offset: query.offset };
  }
  async adminDetail(id: string) {
    const row = await this.prisma.consultation.findUnique({ where: { id }, include: { doctor: { include: { user: { select: { full_name: true } } } }, pregnancy_profile: { select: { user: { select: { full_name: true } } } }, payment: true } });
    if (!row) throw new NotFoundException('Konsultasi tidak ditemukan');
    return this.serializeConsultation(row);
  }
  async detail(id: string, user: CurrentUserData) {
    const c = await this.getAuthorized(id, user);
    return user.role === UserRole.DOKTER
      ? {
          ...c,
          medical_summary: await this.bidan.getVisitBrief(
            c.pregnancy_profile_id,
            { ...user, role: UserRole.ADMIN },
          ),
        }
      : c;
  }
  async cancel(id: string, user: CurrentUserData) {
    const c = await this.getAuthorized(id, user);
    if (
      user.role !== UserRole.IBU_HAMIL ||
      c.status !== PrismaConsultationStatus.pending_payment
    )
      throw new BadRequestException(
        'Hanya pembayaran pending yang dapat dibatalkan',
      );
    return this.prisma.consultation.update({
      where: { id },
      data: { status: ConsultationStatus.CANCELLED },
    });
  }
  async complete(id: string, user: CurrentUserData) {
    const c = await this.getAuthorized(id, user);
    if (
      user.role !== UserRole.DOKTER ||
      (c.status !== PrismaConsultationStatus.scheduled &&
        c.status !== PrismaConsultationStatus.ongoing)
    )
      throw new BadRequestException('Konsultasi belum dapat diselesaikan');
    return this.prisma.consultation.update({
      where: { id },
      data: { status: ConsultationStatus.COMPLETED },
    });
  }
  async messages(
    id: string,
    limit: number,
    offset: number,
    user: CurrentUserData,
  ) {
    await this.getAuthorized(id, user);
    return this.prisma.consultationMessage.findMany({
      where: { consultation_id: id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
    });
  }
  async send(id: string, message: string, user: CurrentUserData) {
    const c = await this.getAuthorized(id, user);
    if (
      c.status !== PrismaConsultationStatus.scheduled &&
      c.status !== PrismaConsultationStatus.ongoing
    )
      throw new BadRequestException('Chat belum aktif');
    const result = await this.prisma.$transaction(async (tx) => {
      if (c.status === PrismaConsultationStatus.scheduled)
        await tx.consultation.update({
          where: { id },
          data: { status: ConsultationStatus.ONGOING },
        });
      return tx.consultationMessage.create({
        data: {
          consultation_id: id,
          sender_user_id: user.id,
          sender_type:
            user.role === UserRole.DOKTER
              ? ConsultationSenderType.DOCTOR
              : ConsultationSenderType.PATIENT,
          message,
        },
      });
    });
    return result;
  }
  private async getAuthorized(id: string, user: CurrentUserData) {
    const c = await this.prisma.consultation.findUnique({
      where: { id },
      include: { pregnancy_profile: true, doctor: true, payment: true },
    });
    if (!c) throw new NotFoundException('Konsultasi tidak ditemukan');
    const allowed =
      user.role === UserRole.ADMIN ||
      (user.role === UserRole.IBU_HAMIL &&
        c.pregnancy_profile.user_id === user.id) ||
      (user.role === UserRole.DOKTER && c.doctor.user_id === user.id);
    if (!allowed)
      throw new ForbiddenException('Tidak memiliki akses ke konsultasi');
    return c;
  }
  private dateScope(query: { date_from?: string; date_to?: string }): Prisma.ConsultationWhereInput {
    return query.date_from || query.date_to ? { scheduled_at: { ...(query.date_from && { gte: new Date(query.date_from) }), ...(query.date_to && { lte: new Date(query.date_to) }) } } : {};
  }

  private serializeConsultation<T extends Record<string, unknown>>(row: T) {
    const payment = row.payment as
      | ({ amount?: { toString(): string } } & Record<string, unknown>)
      | null
      | undefined;
    return {
      ...row,
      ...(row.price_snapshot !== undefined
        ? { price_snapshot: String(row.price_snapshot) }
        : {}),
      ...(row.platform_fee !== undefined
        ? { platform_fee: String(row.platform_fee) }
        : {}),
      ...(payment && {
        payment: {
          ...payment,
          ...(payment.amount && { amount: payment.amount.toString() }),
        },
      }),
    };
  }
}
