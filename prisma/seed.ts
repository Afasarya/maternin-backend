import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  AncSource,
  CheckinType,
  NotificationChannel,
  NotificationStatus,
  NotifyOn,
  PregnancyOutcome,
  PregnancyStatus,
  PrismaClient,
  ReminderStatus,
  ReminderType,
  RiskBadge,
  SymptomSource,
  UserRole,
} from '../generated/prisma/client.js';

const SEED_PASSWORD = 'MaternIn123!';

const puskesmasSeeds = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Puskesmas Halmahera',
    latitude: -6.996905,
    longitude: 110.437594,
    wilayah_kerja: 'Kecamatan Semarang Timur, Kota Semarang',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Puskesmas Pandanaran',
    latitude: -6.985056,
    longitude: 110.414833,
    wilayah_kerja: 'Kecamatan Semarang Selatan, Kota Semarang',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Puskesmas Ngesrep',
    latitude: -7.034014,
    longitude: 110.417806,
    wilayah_kerja: 'Kecamatan Banyumanik, Kota Semarang',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Puskesmas Kedungmundu',
    latitude: -7.021928,
    longitude: 110.460776,
    wilayah_kerja: 'Kecamatan Tembalang, Kota Semarang',
  },
] as const;

const userSeeds = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    role: UserRole.admin,
    full_name: 'Admin MaternIn',
    phone_number: '+6281110000001',
    email: 'admin@maternin.example.test',
    puskesmas_id: null,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    role: UserRole.bidan,
    full_name: 'Bidan Dewi Lestari',
    phone_number: '+6281210000001',
    email: 'dewi.lestari@maternin.example.test',
    puskesmas_id: puskesmasSeeds[0].id,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    role: UserRole.bidan,
    full_name: 'Bidan Ratih Kusuma',
    phone_number: '+6281210000002',
    email: 'ratih.kusuma@maternin.example.test',
    puskesmas_id: puskesmasSeeds[1].id,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    role: UserRole.kader,
    full_name: 'Rina Wulandari',
    phone_number: '+6281310000001',
    email: 'rina.wulandari@maternin.example.test',
    puskesmas_id: puskesmasSeeds[0].id,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    role: UserRole.kader,
    full_name: 'Nur Aisyah',
    phone_number: '+6281310000002',
    email: 'nur.aisyah@maternin.example.test',
    puskesmas_id: puskesmasSeeds[2].id,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    role: UserRole.ibu_hamil,
    full_name: 'Siti Rahmawati',
    phone_number: '+6281410000001',
    email: 'siti.rahmawati@maternin.example.test',
    puskesmas_id: puskesmasSeeds[0].id,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    role: UserRole.ibu_hamil,
    full_name: 'Anisa Putri',
    phone_number: '+6281410000002',
    email: 'anisa.putri@maternin.example.test',
    puskesmas_id: puskesmasSeeds[0].id,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    role: UserRole.ibu_hamil,
    full_name: 'Maya Kartika',
    phone_number: '+6281410000003',
    email: 'maya.kartika@maternin.example.test',
    puskesmas_id: puskesmasSeeds[1].id,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000004',
    role: UserRole.ibu_hamil,
    full_name: 'Fitri Handayani',
    phone_number: '+6281410000004',
    email: 'fitri.handayani@maternin.example.test',
    puskesmas_id: puskesmasSeeds[2].id,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000005',
    role: UserRole.ibu_hamil,
    full_name: 'Lina Maharani',
    phone_number: '+6281410000005',
    email: 'lina.maharani@maternin.example.test',
    puskesmas_id: puskesmasSeeds[0].id,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000006',
    role: UserRole.ibu_hamil,
    full_name: 'Rani Puspitasari',
    phone_number: '+6281410000006',
    email: 'rani.puspitasari@maternin.example.test',
    puskesmas_id: puskesmasSeeds[0].id,
  },
] as const;

const pregnancyProfileSeeds = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    user_id: 'd0000000-0000-4000-8000-000000000001',
    hpht: new Date('2026-07-01T00:00:00.000Z'),
    hpl: new Date('2027-04-07T00:00:00.000Z'),
    gravida: 1,
    existing_conditions: [],
    had_preeclampsia_history: false,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000009',
    user_id: 'd0000000-0000-4000-8000-000000000002',
    hpht: new Date('2025-09-01T00:00:00.000Z'),
    hpl: new Date('2026-06-08T00:00:00.000Z'),
    gravida: 2,
    existing_conditions: ['riwayat_preeklampsia'],
    status: PregnancyStatus.nifas,
    pregnancy_outcome: PregnancyOutcome.persalinan,
    ended_at: new Date('2026-07-22T08:00:00.000Z'),
    nifas_start_date: new Date('2026-07-22T00:00:00.000Z'),
    had_preeclampsia_history: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000003',
    user_id: 'd0000000-0000-4000-8000-000000000003',
    hpht: new Date('2026-06-15T00:00:00.000Z'),
    hpl: new Date('2027-03-22T00:00:00.000Z'),
    gravida: 1,
    existing_conditions: [],
    had_preeclampsia_history: false,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000005',
    user_id: 'd0000000-0000-4000-8000-000000000005',
    hpht: new Date('2026-01-10T00:00:00.000Z'),
    hpl: new Date('2026-10-17T00:00:00.000Z'),
    gravida: 2,
    existing_conditions: ['anemia'],
    had_preeclampsia_history: false,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000006',
    user_id: 'd0000000-0000-4000-8000-000000000006',
    hpht: new Date('2026-02-01T00:00:00.000Z'),
    hpl: new Date('2026-11-08T00:00:00.000Z'),
    gravida: 1,
    existing_conditions: [],
    had_preeclampsia_history: false,
  },
] as const;

const ancRecordSeeds = [
  {
    id: '90000000-0000-4000-8000-000000000001',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    recorded_by_user_id: 'b0000000-0000-4000-8000-000000000001',
    source: AncSource.nakes,
    systolic: 145,
    diastolic: 95,
    weight_kg: 63.5,
    fundal_height_cm: 24,
    protein_urine: 'positif',
    platelet_count: 145000,
    recorded_at: new Date('2026-07-25T08:00:00.000Z'),
  },
] as const;

const symptomCheckinSeeds = [
  {
    id: '91000000-0000-4000-8000-000000000001',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    checkin_type: CheckinType.pregnancy,
    answers: {
      bengkak_kaki: true,
      sakit_kepala: 'berat',
      pandangan_kabur: true,
    },
    source: SymptomSource.self,
    created_at: new Date('2026-07-27T07:30:00.000Z'),
  },
  {
    id: '91000000-0000-4000-8000-000000000005',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000005',
    checkin_type: CheckinType.pregnancy,
    answers: { mudah_lelah: true, pusing: 'kadang' },
    source: SymptomSource.self,
    created_at: new Date('2026-07-26T07:30:00.000Z'),
  },
  {
    id: '91000000-0000-4000-8000-000000000006',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000006',
    checkin_type: CheckinType.pregnancy,
    answers: { keluhan: 'tidak_ada' },
    source: SymptomSource.self,
    created_at: new Date('2026-07-25T07:30:00.000Z'),
  },
] as const;

const riskAssessmentSeeds = [
  {
    id: '92000000-0000-4000-8000-000000000001',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    symptom_checkin_id: '91000000-0000-4000-8000-000000000001',
    triage_score: 88,
    anemia_probability: 0.28,
    preeclampsia_probability: 0.91,
    aggregate_score: 90,
    risk_badge: RiskBadge.merah,
    risk_factors: [
      'Tekanan darah tinggi (145/95)',
      'Sakit kepala berat',
      'Pandangan kabur',
    ],
    recommendation_text: 'Segera periksa ke fasilitas kesehatan.',
    created_at: new Date('2026-07-27T08:00:00.000Z'),
  },
  {
    id: '92000000-0000-4000-8000-000000000005',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000005',
    symptom_checkin_id: '91000000-0000-4000-8000-000000000005',
    triage_score: 58,
    anemia_probability: 0.63,
    preeclampsia_probability: 0.18,
    aggregate_score: 61,
    risk_badge: RiskBadge.kuning,
    risk_factors: ['Keluhan mudah lelah', 'Riwayat anemia'],
    recommendation_text: 'Jadwalkan pemeriksaan dengan bidan.',
    created_at: new Date('2026-07-26T08:00:00.000Z'),
  },
  {
    id: '92000000-0000-4000-8000-000000000006',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000006',
    symptom_checkin_id: '91000000-0000-4000-8000-000000000006',
    triage_score: 15,
    anemia_probability: 0.08,
    preeclampsia_probability: 0.05,
    aggregate_score: 12,
    risk_badge: RiskBadge.hijau,
    risk_factors: [],
    recommendation_text: 'Lanjutkan pemantauan rutin.',
    created_at: new Date('2026-07-25T08:00:00.000Z'),
  },
] as const;

const familyCircleSeeds = [
  {
    id: 'f0000000-0000-4000-8000-000000000001',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    contact_name: 'Budi Rahmawan',
    contact_phone: '+6281510000001',
    relation: 'suami',
    notify_on: NotifyOn.semua_perubahan,
  },
  {
    id: 'f0000000-0000-4000-8000-000000000002',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    contact_name: 'Sri Lestari',
    contact_phone: '+6281510000002',
    relation: 'ibu',
    notify_on: NotifyOn.merah_only,
  },
] as const;

const reminderSeeds = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    reminder_type: ReminderType.anc_checkup,
    cadence_days: 14,
    next_trigger_at: new Date('2026-08-08T00:00:00.000Z'),
    status: ReminderStatus.active,
  },
  {
    id: '70000000-0000-4000-8000-000000000002',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000009',
    reminder_type: ReminderType.postpartum_checkin,
    cadence_days: 1,
    next_trigger_at: new Date('2026-07-26T00:00:00.000Z'),
    status: ReminderStatus.active,
  },
  {
    id: '70000000-0000-4000-8000-000000000003',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000003',
    reminder_type: ReminderType.anc_checkup,
    cadence_days: 14,
    next_trigger_at: new Date('2026-08-08T00:00:00.000Z'),
    status: ReminderStatus.active,
  },
  {
    id: '70000000-0000-4000-8000-000000000005',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000005',
    reminder_type: ReminderType.anc_checkup,
    cadence_days: 7,
    next_trigger_at: new Date('2026-08-02T00:00:00.000Z'),
    status: ReminderStatus.active,
  },
  {
    id: '70000000-0000-4000-8000-000000000006',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000006',
    reminder_type: ReminderType.anc_checkup,
    cadence_days: 14,
    next_trigger_at: new Date('2026-07-27T00:00:00.000Z'),
    status: ReminderStatus.active,
  },
] as const;

const notificationLogSeeds = [
  {
    id: '80000000-0000-4000-8000-000000000001',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    channel: NotificationChannel.wa_patient,
    message: 'Halo Siti Rahmawati, waktunya pemeriksaan kehamilan rutin Anda.',
    status: NotificationStatus.sent,
    sent_at: new Date('2026-07-26T08:00:00.000Z'),
  },
  {
    id: '80000000-0000-4000-8000-000000000002',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    channel: NotificationChannel.wa_family,
    message: '[MaternIn] Update kondisi Siti Rahmawati: status risiko kuning.',
    status: NotificationStatus.failed,
    sent_at: null,
  },
  {
    id: '80000000-0000-4000-8000-000000000003',
    pregnancy_profile_id: 'e0000000-0000-4000-8000-000000000001',
    channel: NotificationChannel.wa_bidan,
    message: '[MaternIn] Pasien Siti Rahmawati memiliki status risiko kuning.',
    status: NotificationStatus.sent,
    sent_at: new Date('2026-07-26T08:05:00.000Z'),
  },
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed data dummy tidak boleh dijalankan di production');
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL belum dikonfigurasi');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const password_hash = await bcrypt.hash(SEED_PASSWORD, 12);

    await prisma.$transaction(
      puskesmasSeeds.map(({ id, ...data }) =>
        prisma.puskesmas.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        }),
      ),
    );

    await prisma.$transaction(
      userSeeds.map(({ id, ...data }) =>
        prisma.user.upsert({
          where: { phone_number: data.phone_number },
          update: { ...data, password_hash },
          create: { id, ...data, password_hash },
        }),
      ),
    );

    await prisma.$transaction(
      pregnancyProfileSeeds.map(({ id, ...data }) =>
        prisma.pregnancyProfile.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        }),
      ),
    );

    await prisma.$transaction(
      ancRecordSeeds.map(({ id, ...data }) =>
        prisma.ancRecord.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        }),
      ),
    );

    await prisma.$transaction(
      symptomCheckinSeeds.map(({ id, ...data }) =>
        prisma.symptomCheckin.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        }),
      ),
    );

    await prisma.$transaction(
      riskAssessmentSeeds.map(({ id, ...data }) =>
        prisma.riskAssessment.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        }),
      ),
    );

    await prisma.$transaction(
      familyCircleSeeds.map(({ id, ...data }) =>
        prisma.familyCircle.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        }),
      ),
    );

    await prisma.$transaction(
      reminderSeeds.map(({ id, ...data }) =>
        prisma.reminder.upsert({
          where: {
            pregnancy_profile_id_reminder_type: {
              pregnancy_profile_id: data.pregnancy_profile_id,
              reminder_type: data.reminder_type,
            },
          },
          update: data,
          create: { id, ...data },
        }),
      ),
    );

    await prisma.$transaction(
      notificationLogSeeds.map(({ id, ...data }) =>
        prisma.notificationLog.upsert({
          where: { id },
          update: data,
          create: { id, ...data },
        }),
      ),
    );

    const [
      puskesmasCount,
      userCount,
      pregnancyProfileCount,
      ancRecordCount,
      symptomCheckinCount,
      riskAssessmentCount,
      familyCircleCount,
      reminderCount,
      notificationLogCount,
    ] = await Promise.all([
      prisma.puskesmas.count({
        where: { id: { in: puskesmasSeeds.map(({ id }) => id) } },
      }),
      prisma.user.count({
        where: {
          phone_number: {
            in: userSeeds.map(({ phone_number }) => phone_number),
          },
        },
      }),
      prisma.pregnancyProfile.count({
        where: { id: { in: pregnancyProfileSeeds.map(({ id }) => id) } },
      }),
      prisma.ancRecord.count({
        where: { id: { in: ancRecordSeeds.map(({ id }) => id) } },
      }),
      prisma.symptomCheckin.count({
        where: { id: { in: symptomCheckinSeeds.map(({ id }) => id) } },
      }),
      prisma.riskAssessment.count({
        where: { id: { in: riskAssessmentSeeds.map(({ id }) => id) } },
      }),
      prisma.familyCircle.count({
        where: { id: { in: familyCircleSeeds.map(({ id }) => id) } },
      }),
      prisma.reminder.count({
        where: {
          OR: reminderSeeds.map(({ pregnancy_profile_id, reminder_type }) => ({
            pregnancy_profile_id,
            reminder_type,
          })),
        },
      }),
      prisma.notificationLog.count({
        where: { id: { in: notificationLogSeeds.map(({ id }) => id) } },
      }),
    ]);

    console.log(
      `Seed selesai: ${puskesmasCount} puskesmas, ${userCount} pengguna, ${pregnancyProfileCount} profil kehamilan, ${ancRecordCount} catatan ANC, ${symptomCheckinCount} symptom check-in, ${riskAssessmentCount} risk assessment, ${familyCircleCount} kontak keluarga, ${reminderCount} reminder, ${notificationLogCount} log notifikasi.`,
    );
    console.log(`Password seluruh akun dummy: ${SEED_PASSWORD}`);
    console.table(
      userSeeds.map(({ id, full_name, phone_number, role, puskesmas_id }) => ({
        id,
        full_name,
        phone_number,
        role,
        puskesmas_id: puskesmas_id ?? '-',
      })),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed gagal:', error);
  process.exitCode = 1;
});
