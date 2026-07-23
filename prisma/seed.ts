import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '../generated/prisma/client.js';

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

    const [puskesmasCount, userCount] = await Promise.all([
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
    ]);

    console.log(
      `Seed selesai: ${puskesmasCount} puskesmas, ${userCount} pengguna.`,
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
