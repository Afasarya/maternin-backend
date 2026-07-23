# Task 17 — Testing, Seeding & Final Verification

## Tujuan
Buat unit tests, seeder database untuk demo data, dan verifikasi akhir bahwa semua endpoint berfungsi sesuai PRD. Pastikan semua guardrails wajib terpenuhi.

## Scope
- Unit tests untuk semua service dan controller
- Database seeder (data dummy untuk testing) via Prisma
- Verifikasi checklist PRD section 10.5
- Final build test

## Detail Implementasi

### 1. Database Seeder
File: `prisma/seed.ts`
- Script yang bisa dijalankan: `npx prisma db seed`
- Gunakan `PrismaClient` langsung (bukan lewat NestJS DI):
  ```typescript
  import { PrismaClient } from '@prisma/client';
  const prisma = new PrismaClient();

  async function main() {
    // Seed data here...
  }

  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
  ```

- Buat data dummy:
  - 1 Puskesmas: "Puskesmas Tembalang", lat/lng Semarang
  - Users:
    - 1 admin: admin@maternin.id / password123
    - 2 bidan: linked ke puskesmas
    - 2 kader: linked ke puskesmas
    - 3 ibu_hamil
  - 3 Pregnancy Profiles (untuk 3 ibu_hamil, beda status: hamil, nifas, selesai)
  - 5 ANC Records (spread across profiles)
  - 3 Symptom Checkins
  - 3 Risk Assessments (1 hijau, 1 kuning, 1 merah)
  - 2 Postpartum Logs
  - 2 Family Circle contacts
  - 3 Reminders (active)
  - 5 Notification Logs

- Contoh seeder pakai Prisma:
  ```typescript
  // Seed Puskesmas
  const puskesmas = await prisma.puskesmas.create({
    data: {
      name: 'Puskesmas Tembalang',
      latitude: -7.0487,
      longitude: 110.4363,
      wilayah_kerja: 'Tembalang, Semarang',
    },
  });

  // Seed Users
  const admin = await prisma.user.create({
    data: {
      role: 'admin',
      full_name: 'Admin MaternIn',
      phone_number: '+6281234567890',
      email: 'admin@maternin.id',
      password_hash: await bcrypt.hash('password123', 10),
    },
  });

  const bidan1 = await prisma.user.create({
    data: {
      role: 'bidan',
      full_name: 'Bidan Sari',
      phone_number: '+6281234567891',
      password_hash: await bcrypt.hash('password123', 10),
      puskesmas_id: puskesmas.id,
    },
  });

  // ... dst
  ```

- Tambahkan di `package.json`:
  ```json
  {
    "prisma": {
      "seed": "ts-node prisma/seed.ts"
    }
  }
  ```
- Jalankan: `npx prisma db seed`

### 2. Unit Tests

#### Auth Module Tests: `src/auth/auth.service.spec.ts`
- Test register: sukses, duplicate phone error
- Test login: sukses, wrong password, user not found
- Test JWT generation: payload correct
- Mock `PrismaService` dengan jest mock

#### Pregnancy Profiles Tests: `src/pregnancy-profiles/pregnancy-profiles.service.spec.ts`
- Test create: HPL calculated correctly
- Test update status: valid transition, invalid transition error
- Test access control logic

#### ANC Records Tests: `src/anc-records/anc-records.service.spec.ts`
- Test create: sukses, idempotency
- Test findLatest: return newest record

#### Symptom Checkins Tests: `src/symptom-checkins/symptom-checkins.service.spec.ts`
- Test create: AI Service called, risk assessment saved
- Test timeout handling: proper fallback

#### Risk Assessments Tests: `src/risk-assessments/risk-assessments.service.spec.ts`
- Test createFromCallback: saved, cache invalidated, reminder updated
- Test findLatest: cache hit/miss

#### Reminders Tests: `src/reminders/reminders.service.spec.ts`
- Test cadence calculation: merah=3, kuning=7, hijau=14
- Test postpartum cadence: day ranges
- Test getDueReminders: correct filter

#### Sync Tests: `src/sync/sync.service.spec.ts`
- Test batch processing: all records processed
- Test idempotency: duplicate skipped
- Test mixed payload types

#### Mocking PrismaService di Tests
```typescript
// Contoh mock PrismaService
const mockPrismaService = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pregnancyProfile: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  // ... dst untuk setiap model
};

// Di TestingModule
const module = await Test.createTestingModule({
  providers: [
    AuthService,
    { provide: PrismaService, useValue: mockPrismaService },
  ],
}).compile();
```

### 3. Verifikasi Checklist PRD Section 10.5
File: `src/common/seeders/verify-checklist.ts`
Script yang scan codebase dan verifikasi:
- [ ] Nggak ada credential hardcoded di kode (grep untuk string patterns)
- [ ] Kolom yang sering di-query/sort udah ada index-nya (cek `schema.prisma` `@@index` dan `@unique`)
- [ ] Endpoint list udah pagination (cek controller methods)
- [ ] Panggilan ke AI Service/Fonnte punya timeout dan error handling
- [ ] Endpoint internal udah divalidasi token
- [ ] Endpoint yang butuh role tertentu udah dipasangin guard
- [ ] Global exception filter aktif
- [ ] `.env` ada di `.gitignore`
- [ ] `.env.example` ada dan lengkap
- [ ] Rate limiting di `/auth/login` dan `/symptom-checkins`
- [ ] `prisma/schema.prisma` dan `prisma/migrations/` ada dan tidak di-gitignore

### 4. Run All Tests
```bash
npm run test              # Unit tests
npm run build             # Build check
npm run lint              # Lint check
npx prisma validate       # Validate Prisma schema
```

### 5. Final Integration Verification
- Start app: `npm run start:dev`
- Jalankan seeder: `npx prisma db seed`
- Test flow end-to-end via Postman:
  1. Register ibu_hamil → login → get token
  2. Create pregnancy profile
  3. Create ANC record
  4. Create symptom checkin → verify AI Service called (mock)
  5. Check risk assessment created
  6. Create postpartum log
  7. Add family circle contact
  8. Check reminders created
  9. Bidan login → get patients → verify sorted by risk
  10. Generate monthly report

## Postman Collection
Generate file: `postman/17-testing-seed.postman_collection.json`
- **Folder: End-to-End Flow**
  - Step-by-step requests yang simulate full user journey
  - Pre-request scripts untuk chain data antar request
  - Tests scripts untuk validate response

## Postman Environment
Generate file: `postman/maternin-environment.json`
- Variables:
  - `base_url`: `http://localhost:3000`
  - `internal_token`: placeholder
  - `token_ibu`: (auto-filled by login scripts)
  - `token_bidan`: (auto-filled)
  - `token_kader`: (auto-filled)
  - `token_admin`: (auto-filled)
  - `pregnancy_profile_id`: (auto-filled)
  - `puskesmas_id`: (auto-filled)
