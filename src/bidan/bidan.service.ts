import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  PregnancyStatus,
  ReminderStatus,
  RiskBadge,
  UserRole,
} from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BidanCacheService } from './bidan-cache.service.js';
import { QueryPatientsDto } from './dto/query-patients.dto.js';
import { AiServiceClient } from '../common/services/ai-service.client.js';

const patientSnapshotInclude = {
  user: {
    select: {
      full_name: true,
      phone_number: true,
    },
  },
  risk_assessments: {
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      risk_badge: true,
      aggregate_score: true,
      risk_factors: true,
      created_at: true,
    },
  },
  symptom_checkins: {
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { created_at: true },
  },
} satisfies Prisma.PregnancyProfileInclude;

type PatientSnapshotProfile = Prisma.PregnancyProfileGetPayload<{
  include: typeof patientSnapshotInclude;
}>;

export interface BidanPatientItem {
  pregnancy_profile_id: string;
  patient_name: string;
  phone_number: string;
  hpl: string;
  gestational_week: number;
  latest_risk_badge: RiskBadge | null;
  latest_aggregate_score: string | null;
  last_checkin_date: string | null;
  risk_factors: string[];
}

export interface VisitBriefDto {
  patient_name: string;
  gestational_week: number;
  latest_risk_badge: RiskBadge | null;
  latest_aggregate_score: string | null;
  vitals_summary: {
    systolic: number;
    diastolic: number;
    weight_kg: string;
    fundal_height_cm: string | null;
    platelet_count: number | null;
  } | null;
  risk_factors: string[];
  recent_symptoms: string[];
  recommendation: string;
  last_visit_date: string | null;
}

@Injectable()
export class BidanService {
  private static readonly PATIENTS_CACHE_TTL_SECONDS = 5 * 60;
  private static readonly RECENT_RECORD_LIMIT = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
    private readonly cache: BidanCacheService,
    private readonly aiServiceClient: AiServiceClient,
  ) {}

  async getPatients(requester: CurrentUserData, query: QueryPatientsDto) {
    if (
      requester.role === UserRole.BIDAN &&
      query.puskesmas_id &&
      query.puskesmas_id !== requester.puskesmas_id
    ) {
      throw new ForbiddenException('Bidan hanya dapat mengakses wilayahnya');
    }
    const scopedRequester =
      requester.role === UserRole.ADMIN && query.puskesmas_id
        ? {
            ...requester,
            role: UserRole.BIDAN,
            puskesmas_id: query.puskesmas_id,
          }
        : requester;
    const snapshot = await this.getPatientSnapshot(scopedRequester);
    const normalizedSearch = query.search?.toLocaleLowerCase('id-ID');
    const filtered = snapshot.filter((patient) => {
      const matchesRisk =
        !query.risk_badge || patient.latest_risk_badge === query.risk_badge;
      const matchesSearch =
        !normalizedSearch ||
        patient.patient_name
          .toLocaleLowerCase('id-ID')
          .includes(normalizedSearch);

      return matchesRisk && matchesSearch;
    });

    return {
      data: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getVisitBrief(
    profileId: string,
    requester: CurrentUserData,
    requestId = '',
  ) {
    const profile = await this.pregnancyProfilesService.findOne(
      profileId,
      requester,
    );
    const [ancHistory, riskAssessments, symptomCheckins, postpartumLogs] =
      await Promise.all([
        this.prisma.ancRecord.findMany({
          where: { pregnancy_profile_id: profileId },
          orderBy: [{ recorded_at: 'desc' }, { id: 'desc' }],
          take: BidanService.RECENT_RECORD_LIMIT,
        }),
        this.prisma.riskAssessment.findMany({
          where: { pregnancy_profile_id: profileId },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: BidanService.RECENT_RECORD_LIMIT,
        }),
        this.prisma.symptomCheckin.findMany({
          where: { pregnancy_profile_id: profileId },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: BidanService.RECENT_RECORD_LIMIT,
          select: { answers: true, created_at: true },
        }),
        this.prisma.postpartumLog.findMany({
          where: { pregnancy_profile_id: profileId },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: BidanService.RECENT_RECORD_LIMIT,
        }),
      ]);
    const aiBrief = await this.aiServiceClient.generateVisitBrief(
      {
        pregnancy_profile_id: profileId,
        anc_history: ancHistory,
        risk_assessments: riskAssessments,
        postpartum_logs: postpartumLogs,
      },
      requestId,
    );
    const latestAnc = ancHistory[0] ?? null;
    const latestRisk = riskAssessments[0] ?? null;

    return {
      patient_name: profile.user.full_name,
      gestational_week: this.calculateGestationalWeek(
        profile.hpht,
        profile.ended_at,
      ),
      latest_risk_badge: latestRisk
        ? (latestRisk.risk_badge as RiskBadge)
        : null,
      latest_aggregate_score: latestRisk
        ? latestRisk.aggregate_score.toString()
        : null,
      vitals_summary: this.buildVitalsSummary(latestAnc),
      risk_factors: this.toStringArray(latestRisk?.risk_factors),
      recent_symptoms: this.buildRecentSymptoms(
        symptomCheckins,
        postpartumLogs,
      ),
      recommendation: aiBrief.brief_text,
      last_visit_date: latestAnc
        ? this.toDateOnly(latestAnc.recorded_at)
        : null,
    } satisfies VisitBriefDto;
  }

  async getPatientDetail(profileId: string, requester: CurrentUserData) {
    const profile = await this.pregnancyProfilesService.findOne(
      profileId,
      requester,
    );
    const [latestAnc, latestRisk, latestSymptom, counts] = await Promise.all([
      this.prisma.ancRecord.findFirst({
        where: { pregnancy_profile_id: profileId },
        orderBy: [{ recorded_at: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.riskAssessment.findFirst({
        where: { pregnancy_profile_id: profileId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.symptomCheckin.findFirst({
        where: { pregnancy_profile_id: profileId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      Promise.all([
        this.prisma.ancRecord.count({
          where: { pregnancy_profile_id: profileId },
        }),
        this.prisma.symptomCheckin.count({
          where: { pregnancy_profile_id: profileId },
        }),
        this.prisma.riskAssessment.count({
          where: { pregnancy_profile_id: profileId },
        }),
        this.prisma.postpartumLog.count({
          where: { pregnancy_profile_id: profileId },
        }),
      ]),
    ]);

    return {
      profile,
      latest_anc: this.serializeDecimals(latestAnc),
      latest_risk_assessment: this.serializeDecimals(latestRisk),
      latest_symptom_checkin: latestSymptom,
      counts: {
        anc: counts[0],
        symptom: counts[1],
        risk: counts[2],
        postpartum: counts[3],
      },
    };
  }

  async getStatistics(requester: CurrentUserData) {
    const scope = this.buildProfileScope(requester);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [patients, nifasCount, overdueCheckins, ancThisMonth, latestAlerts] =
      await Promise.all([
        this.getPatientSnapshot(requester),
        this.prisma.pregnancyProfile.count({
          where: { ...scope, status: PregnancyStatus.NIFAS },
        }),
        this.prisma.pregnancyProfile.count({
          where: {
            ...scope,
            status: {
              in: [PregnancyStatus.HAMIL, PregnancyStatus.NIFAS],
            },
            reminders: {
              some: {
                status: ReminderStatus.ACTIVE,
                next_trigger_at: { lte: new Date() },
              },
            },
          },
        }),
        this.prisma.ancRecord.count({
          where: {
            pregnancy_profile: scope,
            recorded_at: { gte: monthStart },
          },
        }),
        this.prisma.riskAssessment.findMany({
          where: { pregnancy_profile: scope },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 5,
          select: {
            pregnancy_profile_id: true,
            risk_badge: true,
            risk_factors: true,
            created_at: true,
            pregnancy_profile: {
              select: { user: { select: { full_name: true } } },
            },
          },
        }),
      ]);
    const riskDistribution = {
      merah: 0,
      kuning: 0,
      hijau: 0,
    };

    patients.forEach((patient) => {
      if (patient.latest_risk_badge) {
        riskDistribution[patient.latest_risk_badge] += 1;
      }
    });

    return {
      total_patients: patients.length,
      risk_distribution: riskDistribution,
      overdue_checkins: overdueCheckins,
      nifas_count: nifasCount,
      anc_this_month: ancThisMonth,
      latest_alerts: latestAlerts.map((alert) => ({
        pregnancy_profile_id: alert.pregnancy_profile_id,
        patient_name: alert.pregnancy_profile.user.full_name,
        risk_badge: alert.risk_badge,
        risk_factors: this.toStringArray(alert.risk_factors),
        occurred_at: alert.created_at,
      })),
    };
  }

  async getRiskMap(requester: CurrentUserData) {
    const scope = this.buildProfileScope(requester);
    const facilities = await this.prisma.puskesmas.findMany({
      where:
        requester.role === UserRole.BIDAN
          ? { id: requester.puskesmas_id ?? undefined }
          : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        wilayah_kerja: true,
      },
    });
    const profiles = await this.prisma.pregnancyProfile.findMany({
      where: {
        ...scope,
        status: { in: [PregnancyStatus.HAMIL, PregnancyStatus.NIFAS] },
      },
      select: {
        user: { select: { puskesmas_id: true } },
        risk_assessments: {
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { risk_badge: true },
        },
      },
    });

    return facilities.map((facility) => {
      const patients = profiles.filter(
        (profile) => profile.user.puskesmas_id === facility.id,
      );
      const risk_distribution = { merah: 0, kuning: 0, hijau: 0 };
      patients.forEach((profile) => {
        const badge = profile.risk_assessments[0]?.risk_badge;
        if (badge === RiskBadge.MERAH) risk_distribution.merah += 1;
        if (badge === RiskBadge.KUNING) risk_distribution.kuning += 1;
        if (badge === RiskBadge.HIJAU) risk_distribution.hijau += 1;
      });
      return {
        puskesmas_id: facility.id,
        puskesmas_name: facility.name,
        latitude: facility.latitude,
        longitude: facility.longitude,
        wilayah_kerja: facility.wilayah_kerja,
        total_patients: patients.length,
        risk_distribution,
      };
    });
  }

  async getAlerts(
    requester: CurrentUserData,
    query: {
      risk_badge?: RiskBadge;
      from?: string;
      to?: string;
      limit: number;
      offset: number;
    },
  ) {
    const profileScope = this.buildProfileScope(requester);
    const where: Prisma.RiskAssessmentWhereInput = {
      pregnancy_profile: profileScope,
      ...(query.risk_badge && { risk_badge: query.risk_badge }),
      ...(query.from || query.to
        ? {
            created_at: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.riskAssessment.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: {
          pregnancy_profile_id: true,
          risk_badge: true,
          risk_factors: true,
          recommendation_text: true,
          created_at: true,
          pregnancy_profile: {
            select: { user: { select: { full_name: true } } },
          },
        },
      }),
      this.prisma.riskAssessment.count({ where }),
    ]);
    return {
      data: rows.map(({ pregnancy_profile, created_at, ...row }) => ({
        ...row,
        patient_name: pregnancy_profile.user.full_name,
        occurred_at: created_at,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  calculateGestationalWeek(hpht: Date, endedAt?: Date | null): number {
    const end = endedAt ?? new Date();
    const startUtc = Date.UTC(
      hpht.getUTCFullYear(),
      hpht.getUTCMonth(),
      hpht.getUTCDate(),
    );
    const endUtc = Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate(),
    );
    const elapsedDays = Math.floor((endUtc - startUtc) / 86_400_000);

    return Math.max(0, Math.floor(elapsedDays / 7));
  }

  private async getPatientSnapshot(requester: CurrentUserData) {
    const scope = this.buildProfileScope(requester);
    const cacheKey =
      requester.role === UserRole.BIDAN && requester.puskesmas_id
        ? `bidan:patients:${requester.puskesmas_id}`
        : null;

    if (cacheKey) {
      const cached = await this.cache.get<BidanPatientItem[]>(cacheKey);

      if (cached) {
        return cached;
      }
    }

    const profiles = await this.prisma.pregnancyProfile.findMany({
      where: { ...scope, status: PregnancyStatus.HAMIL },
      include: patientSnapshotInclude,
    });
    const snapshot = profiles
      .sort((left, right) => this.comparePatients(left, right))
      .map((profile) => this.toPatientItem(profile));

    if (cacheKey) {
      await this.cache.set(
        cacheKey,
        snapshot,
        BidanService.PATIENTS_CACHE_TTL_SECONDS,
      );
    }

    return snapshot;
  }

  private buildProfileScope(
    requester: CurrentUserData,
  ): Prisma.PregnancyProfileWhereInput {
    if (requester.role === UserRole.ADMIN) {
      return {};
    }

    if (requester.role === UserRole.BIDAN) {
      if (!requester.puskesmas_id) {
        throw new ForbiddenException('Bidan belum terhubung ke puskesmas');
      }

      return { user: { puskesmas_id: requester.puskesmas_id } };
    }

    throw new ForbiddenException('Role tidak memiliki akses');
  }

  private comparePatients(
    left: PatientSnapshotProfile,
    right: PatientSnapshotProfile,
  ) {
    const leftRisk = left.risk_assessments[0];
    const rightRisk = right.risk_assessments[0];
    const rankDifference =
      this.riskRank(leftRisk?.risk_badge) -
      this.riskRank(rightRisk?.risk_badge);

    if (rankDifference !== 0) {
      return rankDifference;
    }

    const dateDifference =
      (rightRisk?.created_at.getTime() ?? 0) -
      (leftRisk?.created_at.getTime() ?? 0);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    const nameDifference = left.user.full_name.localeCompare(
      right.user.full_name,
      'id-ID',
    );

    return nameDifference !== 0
      ? nameDifference
      : left.id.localeCompare(right.id);
  }

  private riskRank(riskBadge?: string) {
    switch (riskBadge) {
      case RiskBadge.MERAH:
        return 0;
      case RiskBadge.KUNING:
        return 1;
      case RiskBadge.HIJAU:
        return 2;
      default:
        return 3;
    }
  }

  private toPatientItem(profile: PatientSnapshotProfile): BidanPatientItem {
    const latestRisk = profile.risk_assessments[0];
    const latestCheckin = profile.symptom_checkins[0];

    return {
      pregnancy_profile_id: profile.id,
      patient_name: profile.user.full_name,
      phone_number: profile.user.phone_number,
      hpl: this.toDateOnly(profile.hpl),
      gestational_week: this.calculateGestationalWeek(profile.hpht),
      latest_risk_badge: latestRisk
        ? (latestRisk.risk_badge as RiskBadge)
        : null,
      latest_aggregate_score: latestRisk
        ? latestRisk.aggregate_score.toString()
        : null,
      last_checkin_date: latestCheckin
        ? this.toDateOnly(latestCheckin.created_at)
        : null,
      risk_factors: this.toStringArray(latestRisk?.risk_factors),
    };
  }

  private buildVitalsSummary(
    anc: {
      systolic: number | null;
      diastolic: number | null;
      weight_kg: { toString(): string } | null;
      fundal_height_cm: { toString(): string } | null;
      platelet_count: { toString(): string } | null;
    } | null,
  ) {
    if (
      !anc ||
      anc.systolic === null ||
      anc.diastolic === null ||
      anc.weight_kg === null
    ) {
      return null;
    }

    return {
      systolic: anc.systolic,
      diastolic: anc.diastolic,
      weight_kg: anc.weight_kg.toString(),
      fundal_height_cm: anc.fundal_height_cm?.toString() ?? null,
      platelet_count:
        anc.platelet_count === null
          ? null
          : Number(anc.platelet_count.toString()),
    };
  }

  private buildRecentSymptoms(
    checkins: Array<{ answers: Prisma.JsonValue }>,
    postpartumLogs: Array<{
      day_number: number;
      bleeding_level: string;
      fever: boolean;
      wound_condition: string;
      headache_severe: boolean;
      mood_flag: string;
    }>,
  ) {
    const symptoms = checkins.flatMap(({ answers }) => {
      if (
        typeof answers !== 'object' ||
        answers === null ||
        Array.isArray(answers)
      ) {
        return [];
      }

      return Object.entries(answers).map(
        ([key, value]) => `${key}: ${this.formatJsonValue(value)}`,
      );
    });

    postpartumLogs.forEach((log) => {
      symptoms.push(
        `hari_nifas_${log.day_number}: bleeding_level=${log.bleeding_level}, fever=${String(log.fever)}, wound_condition=${log.wound_condition}, headache_severe=${String(log.headache_severe)}, mood_flag=${log.mood_flag}`,
      );
    });

    return [...new Set(symptoms)].slice(0, 20);
  }

  private formatJsonValue(value: Prisma.JsonValue | undefined) {
    if (value === undefined) {
      return 'undefined';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      return String(value);
    }

    return JSON.stringify(value);
  }

  private toStringArray(value: Prisma.JsonValue | undefined): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private toDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private serializeDecimals<T>(value: T): T {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.serializeDecimals(item)) as T;
    }
    if (value instanceof Date) return value;
    if (Prisma.Decimal.isDecimal(value)) return value.toString() as T;
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.serializeDecimals(item),
        ]),
      ) as T;
    }
    return value;
  }
}
