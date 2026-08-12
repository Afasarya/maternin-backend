import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportQueryDto } from './dto/report-query.dto.js';

const MILLISECONDS_PER_DAY = 86_400_000;

interface ReportScope {
  puskesmasId: string | null;
  puskesmasName: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateMonthlyReport(
    requester: CurrentUserData,
    query: ReportQueryDto,
  ) {
    const generatedAt = new Date();
    const month = query.month ?? generatedAt.getUTCMonth() + 1;
    const year = query.year ?? generatedAt.getUTCFullYear();
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDateExclusive = new Date(Date.UTC(year, month, 1));
    const scope = await this.resolveScope(requester, query.puskesmas_id);
    const profileWhere: Prisma.PregnancyProfileWhereInput = {
      ...(scope.puskesmasId && {
        user: { puskesmas_id: scope.puskesmasId },
      }),
      created_at: { lt: endDateExclusive },
    };
    const relatedProfileScope = scope.puskesmasId
      ? { pregnancy_profile: { user: { puskesmas_id: scope.puskesmasId } } }
      : {};

    const profiles = await this.prisma.pregnancyProfile.findMany({
      where: profileWhere,
      select: {
        id: true,
        status: true,
        hpht: true,
        ended_at: true,
        created_at: true,
        user: { select: { full_name: true } },
        risk_assessments: {
          where: { created_at: { lt: endDateExclusive } },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            risk_badge: true,
            risk_factors: true,
          },
        },
        symptom_checkins: {
          where: { created_at: { lt: endDateExclusive } },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { created_at: true },
        },
      },
    });
    const totalAncVisits = await this.prisma.ancRecord.count({
      where: {
        ...relatedProfileScope,
        recorded_at: { gte: startDate, lt: endDateExclusive },
      },
    });
    const totalSymptomCheckins = await this.prisma.symptomCheckin.count({
      where: {
        ...relatedProfileScope,
        created_at: { gte: startDate, lt: endDateExclusive },
      },
    });
    const postpartumLogs = await this.prisma.postpartumLog.findMany({
      where: {
        ...relatedProfileScope,
        created_at: { gte: startDate, lt: endDateExclusive },
      },
      select: {
        red_flag_triggered: true,
        mental_health_flag: true,
      },
    });
    const notificationGroups = await this.prisma.notificationLog.groupBy({
      by: ['channel', 'status'],
      where: {
        ...relatedProfileScope,
        created_at: { gte: startDate, lt: endDateExclusive },
      },
      orderBy: [{ channel: 'asc' }, { status: 'asc' }],
      _count: { _all: true },
    });

    const summary = {
      total_pregnant: 0,
      total_nifas: 0,
      total_selesai: 0,
      new_registrations: 0,
      total_anc_visits: totalAncVisits,
      total_symptom_checkins: totalSymptomCheckins,
    };
    const riskDistribution = {
      merah: { count: 0, patients: [] as string[] },
      kuning: { count: 0, patients: [] as string[] },
      hijau: { count: 0, patients: [] as string[] },
    };
    const highRiskDetails: Array<{
      patient_name: string;
      risk_factors: string[];
      last_checkin: string | null;
      gestational_week: number;
    }> = [];
    const gestationalReference = new Date(
      Math.min(generatedAt.getTime(), endDateExclusive.getTime() - 1),
    );

    profiles.forEach((profile) => {
      if (profile.status === 'hamil') {
        summary.total_pregnant += 1;
      } else if (profile.status === 'nifas') {
        summary.total_nifas += 1;
      } else if (profile.status === 'selesai') {
        summary.total_selesai += 1;
      }

      if (profile.created_at >= startDate) {
        summary.new_registrations += 1;
      }

      if (profile.status !== 'hamil') {
        return;
      }

      const latestRisk = profile.risk_assessments[0];

      if (!latestRisk) {
        return;
      }

      const badge = latestRisk.risk_badge;
      const bucket = riskDistribution[badge];
      bucket.count += 1;
      bucket.patients.push(profile.user.full_name);

      if (badge === 'merah') {
        highRiskDetails.push({
          patient_name: profile.user.full_name,
          risk_factors: this.toStringArray(latestRisk.risk_factors),
          last_checkin: profile.symptom_checkins[0]
            ? this.toDateOnly(profile.symptom_checkins[0].created_at)
            : null,
          gestational_week: this.calculateGestationalWeek(
            profile.hpht,
            profile.ended_at,
            gestationalReference,
          ),
        });
      }
    });

    Object.values(riskDistribution).forEach((bucket) =>
      bucket.patients.sort((left, right) => left.localeCompare(right, 'id-ID')),
    );
    highRiskDetails.sort((left, right) =>
      left.patient_name.localeCompare(right.patient_name, 'id-ID'),
    );

    const notificationSummary = {
      total_sent: 0,
      total_failed: 0,
      channels: {
        wa_patient: 0,
        wa_bidan: 0,
        wa_family: 0,
        in_app: 0,
      },
    };

    notificationGroups.forEach((group) => {
      const count =
        typeof group._count === 'object' && group._count !== null
          ? (group._count._all ?? 0)
          : 0;

      if (group.status === 'sent') {
        notificationSummary.total_sent += count;
        notificationSummary.channels[group.channel] += count;
      } else if (group.status === 'failed') {
        notificationSummary.total_failed += count;
      }
    });

    return {
      report_period: {
        month,
        year,
        puskesmas_name: scope.puskesmasName,
      },
      summary,
      risk_distribution: riskDistribution,
      high_risk_details: highRiskDetails,
      postpartum_summary: {
        total_nifas_active: summary.total_nifas,
        red_flags_triggered: postpartumLogs.filter(
          ({ red_flag_triggered }) => red_flag_triggered,
        ).length,
        mental_health_flags: postpartumLogs.filter(
          ({ mental_health_flag }) => mental_health_flag === true,
        ).length,
      },
      notification_summary: notificationSummary,
      generated_at: generatedAt,
    };
  }

  async exportMonthlyCsv(requester: CurrentUserData, query: ReportQueryDto) {
    const report = await this.generateMonthlyReport(requester, query);
    const rows: unknown[][] = [
      ['metric', 'value'],
      ['puskesmas', report.report_period.puskesmas_name],
      ...Object.entries(report.summary),
      ['risk_merah', report.risk_distribution.merah.count],
      ['risk_kuning', report.risk_distribution.kuning.count],
      ['risk_hijau', report.risk_distribution.hijau.count],
    ];
    return '\uFEFF' + rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\r\n');
  }

  private csvCell(value: unknown) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  private async resolveScope(
    requester: CurrentUserData,
    requestedPuskesmasId?: string,
  ): Promise<ReportScope> {
    if (requester.role === UserRole.BIDAN) {
      if (!requester.puskesmas_id) {
        throw new ForbiddenException('Bidan belum terhubung ke puskesmas');
      }

      if (
        requestedPuskesmasId &&
        requestedPuskesmasId !== requester.puskesmas_id
      ) {
        throw new ForbiddenException(
          'Bidan hanya dapat mengakses laporan wilayahnya',
        );
      }

      return this.getPuskesmasScope(requester.puskesmas_id);
    }

    if (requester.role === UserRole.ADMIN) {
      return requestedPuskesmasId
        ? this.getPuskesmasScope(requestedPuskesmasId)
        : { puskesmasId: null, puskesmasName: 'Semua Puskesmas' };
    }

    throw new ForbiddenException('Role tidak memiliki akses');
  }

  private async getPuskesmasScope(puskesmasId: string): Promise<ReportScope> {
    const puskesmas = await this.prisma.puskesmas.findUnique({
      where: { id: puskesmasId },
      select: { name: true },
    });

    if (!puskesmas) {
      throw new NotFoundException('Puskesmas tidak ditemukan');
    }

    return { puskesmasId, puskesmasName: puskesmas.name };
  }

  private calculateGestationalWeek(
    hpht: Date,
    endedAt: Date | null,
    referenceDate: Date,
  ) {
    const effectiveEnd =
      endedAt && endedAt < referenceDate ? endedAt : referenceDate;
    const startUtc = Date.UTC(
      hpht.getUTCFullYear(),
      hpht.getUTCMonth(),
      hpht.getUTCDate(),
    );
    const endUtc = Date.UTC(
      effectiveEnd.getUTCFullYear(),
      effectiveEnd.getUTCMonth(),
      effectiveEnd.getUTCDate(),
    );
    const elapsedDays = Math.floor((endUtc - startUtc) / MILLISECONDS_PER_DAY);

    return Math.max(0, Math.floor(elapsedDays / 7));
  }

  private toStringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private toDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
