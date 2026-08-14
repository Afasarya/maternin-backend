import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminStatisticsQueryDto } from './dto/admin-statistics-query.dto.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(query: AdminStatisticsQueryDto) {
    const period = this.buildPeriod(query);
    const [
      users,
      totalPuskesmas,
      doctors,
      profiles,
      consultations,
      payments,
      riskByPuskesmas,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
      }),
      this.prisma.puskesmas.count(),
      this.prisma.doctor.groupBy({
        by: ['is_active'],
        _count: { _all: true },
      }),
      this.prisma.pregnancyProfile.findMany({
        select: {
          risk_assessments: {
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { risk_badge: true },
          },
        },
      }),
      this.prisma.consultation.groupBy({
        by: ['status'],
        where: period ? { created_at: period } : undefined,
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        where: period ? { created_at: period } : undefined,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.puskesmas.findMany({
        select: {
          id: true,
          name: true,
          users: {
            select: {
              pregnancy_profiles: {
                select: {
                  risk_assessments: {
                    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
                    take: 1,
                    select: { risk_badge: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      users_by_role: Object.fromEntries(
        users.map((row) => [row.role, row._count._all]),
      ),
      total_puskesmas: totalPuskesmas,
      doctors: {
        active: doctors.find((row) => row.is_active)?._count._all ?? 0,
        inactive: doctors.find((row) => !row.is_active)?._count._all ?? 0,
      },
      patients: {
        total: profiles.length,
        risk_distribution: this.countRisks(
          profiles.map((profile) => profile.risk_assessments[0]?.risk_badge),
        ),
      },
      consultations_by_status: Object.fromEntries(
        consultations.map((row) => [row.status, row._count._all]),
      ),
      payments: Object.fromEntries(
        payments.map((row) => [
          row.status,
          {
            count: row._count._all,
            amount: row._sum.amount?.toString() ?? '0',
          },
        ]),
      ),
      risk_by_puskesmas: riskByPuskesmas.map((puskesmas) => {
        const badges = puskesmas.users.flatMap((user) =>
          user.pregnancy_profiles.map(
            (profile) => profile.risk_assessments[0]?.risk_badge,
          ),
        );
        return {
          puskesmas_id: puskesmas.id,
          puskesmas_name: puskesmas.name,
          total_patients: badges.length,
          risk_distribution: this.countRisks(badges),
        };
      }),
      period: {
        date_from: query.date_from ?? null,
        date_to: query.date_to ?? null,
      },
    };
  }

  private buildPeriod(query: AdminStatisticsQueryDto) {
    const from = query.date_from ? new Date(query.date_from) : undefined;
    const to = query.date_to ? new Date(query.date_to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('date_from harus sebelum date_to');
    }
    if (!from && !to) return undefined;
    return {
      ...(from && { gte: from }),
      ...(to && { lte: to }),
    } satisfies Prisma.DateTimeFilter;
  }

  private countRisks(badges: Array<string | undefined>) {
    const result = { merah: 0, kuning: 0, hijau: 0 };
    badges.forEach((badge) => {
      if (badge === 'merah' || badge === 'kuning' || badge === 'hijau') {
        result[badge] += 1;
      }
    });
    return result;
  }
}
