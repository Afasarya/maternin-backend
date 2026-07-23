# Task 02 — Prisma Schema (Semua Model + Migrasi)

## Tujuan
Definisikan semua 12 model di Prisma schema yang merepresentasikan tabel database sesuai PRD section 3. Semua model, relasi, enum, dan index didefinisikan di satu file `prisma/schema.prisma`, lalu jalankan migrasi pertama.

## Scope
- Definisikan semua Prisma enum
- Definisikan semua 12+ model di `prisma/schema.prisma`
- Definisikan relasi antar model
- Tambahkan database index sesuai PRD section 10.2
- Jalankan `npx prisma migrate dev` untuk buat migrasi pertama
- Generate Prisma Client (`npx prisma generate`)

## Detail Implementasi

### 1. File: `prisma/schema.prisma`

#### Datasource & Generator
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

#### Enum Definitions
```prisma
enum UserRole {
  ibu_hamil
  bidan
  kader
  admin
}

enum PregnancyStatus {
  hamil
  nifas
  selesai
}

enum RiskBadge {
  hijau
  kuning
  merah
}

enum AncSource {
  self
  nakes
  kader_offline
}

enum CheckinType {
  pregnancy
  postpartum
}

enum BleedingLevel {
  normal
  banyak
  sangat_banyak
}

enum WoundCondition {
  baik
  bau
  bengkak_merah
}

enum MoodFlag {
  baik
  kadang_sedih
  sering_sedih
}

enum NotificationChannel {
  wa_patient
  wa_bidan
  wa_family
  in_app
}

enum NotificationStatus {
  pending
  sent
  failed
  no_device_fallback
}

enum ReminderType {
  anc_checkup
  postpartum_checkin
}

enum ReminderStatus {
  active
  paused
  done
}

enum NotifyOn {
  merah_only
  semua_perubahan
}

enum SyncPayloadType {
  anc_record
  symptom_checkin
}

enum SyncStatus {
  pending
  processed
  failed
}

enum SymptomSource {
  self
  kader_offline
}
```

#### Model: `users`
```prisma
model User {
  id             String    @id @default(uuid()) @db.Uuid
  role           UserRole
  full_name      String
  phone_number   String    @unique
  email          String?
  password_hash  String
  puskesmas_id   String?   @db.Uuid
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt

  puskesmas           Puskesmas?          @relation(fields: [puskesmas_id], references: [id])
  pregnancy_profiles  PregnancyProfile[]
  anc_records         AncRecord[]         @relation("RecordedBy")

  @@index([puskesmas_id])
  @@map("users")
}
```

#### Model: `pregnancy_profiles`
```prisma
model PregnancyProfile {
  id                        String           @id @default(uuid()) @db.Uuid
  user_id                   String           @db.Uuid
  hpht                      DateTime         @db.Date
  hpl                       DateTime         @db.Date
  gravida                   Int
  existing_conditions       Json?            @default("[]")
  status                    PregnancyStatus  @default(hamil)
  nifas_start_date          DateTime?        @db.Date
  had_preeclampsia_history  Boolean          @default(false)
  created_at                DateTime         @default(now())
  updated_at                DateTime         @updatedAt

  user              User               @relation(fields: [user_id], references: [id])
  anc_records       AncRecord[]
  symptom_checkins  SymptomCheckin[]
  risk_assessments  RiskAssessment[]
  postpartum_logs   PostpartumLog[]
  family_circles    FamilyCircle[]
  notifications     NotificationLog[]
  reminders         Reminder[]

  @@index([user_id])
  @@index([status])
  @@map("pregnancy_profiles")
}
```

#### Model: `anc_records`
```prisma
model AncRecord {
  id                     String     @id @default(uuid()) @db.Uuid
  pregnancy_profile_id   String     @db.Uuid
  recorded_by_user_id    String     @db.Uuid
  source                 AncSource
  systolic               Int?
  diastolic              Int?
  weight_kg              Decimal?   @db.Decimal(5, 2)
  fundal_height_cm       Decimal?   @db.Decimal(5, 2)
  protein_urine          String?
  platelet_count         Decimal?   @db.Decimal(10, 2)
  recorded_at            DateTime   @default(now())
  client_uuid            String?    @db.Uuid
  created_at             DateTime   @default(now())

  pregnancy_profile  PregnancyProfile  @relation(fields: [pregnancy_profile_id], references: [id])
  recorded_by        User              @relation("RecordedBy", fields: [recorded_by_user_id], references: [id])

  @@index([pregnancy_profile_id, recorded_at])
  @@map("anc_records")
}
```

#### Model: `symptom_checkins`
```prisma
model SymptomCheckin {
  id                     String        @id @default(uuid()) @db.Uuid
  pregnancy_profile_id   String        @db.Uuid
  checkin_type           CheckinType
  answers                Json
  conjunctiva_image_url  String?
  source                 SymptomSource
  client_uuid            String?       @db.Uuid
  created_at             DateTime      @default(now())

  pregnancy_profile  PregnancyProfile  @relation(fields: [pregnancy_profile_id], references: [id])
  risk_assessments   RiskAssessment[]

  @@map("symptom_checkins")
}
```

#### Model: `risk_assessments`
```prisma
model RiskAssessment {
  id                        String     @id @default(uuid()) @db.Uuid
  pregnancy_profile_id      String     @db.Uuid
  symptom_checkin_id        String?    @db.Uuid
  triage_score              Decimal    @db.Decimal(5, 2)
  anemia_probability        Decimal?   @db.Decimal(5, 4)
  preeclampsia_probability  Decimal?   @db.Decimal(5, 4)
  aggregate_score           Decimal    @db.Decimal(5, 2)
  risk_badge                RiskBadge
  risk_factors              Json
  recommendation_text       String
  created_at                DateTime   @default(now())

  pregnancy_profile  PregnancyProfile  @relation(fields: [pregnancy_profile_id], references: [id])
  symptom_checkin    SymptomCheckin?   @relation(fields: [symptom_checkin_id], references: [id])

  @@index([pregnancy_profile_id, created_at])
  @@index([risk_badge])
  @@map("risk_assessments")
}
```

#### Model: `postpartum_logs`
```prisma
model PostpartumLog {
  id                     String         @id @default(uuid()) @db.Uuid
  pregnancy_profile_id   String         @db.Uuid
  day_number             Int
  bleeding_level         BleedingLevel
  fever                  Boolean
  wound_condition        WoundCondition
  headache_severe        Boolean
  mood_flag              MoodFlag
  red_flag_triggered     Boolean        @default(false)
  created_at             DateTime       @default(now())

  pregnancy_profile  PregnancyProfile  @relation(fields: [pregnancy_profile_id], references: [id])

  @@map("postpartum_logs")
}
```

#### Model: `family_circle`
```prisma
model FamilyCircle {
  id                     String    @id @default(uuid()) @db.Uuid
  pregnancy_profile_id   String    @db.Uuid
  contact_name           String
  contact_phone          String
  relation               String
  notify_on              NotifyOn
  created_at             DateTime  @default(now())

  pregnancy_profile  PregnancyProfile  @relation(fields: [pregnancy_profile_id], references: [id])

  @@map("family_circle")
}
```

#### Model: `puskesmas`
```prisma
model Puskesmas {
  id              String    @id @default(uuid()) @db.Uuid
  name            String
  latitude        Decimal   @db.Decimal(10, 7)
  longitude       Decimal   @db.Decimal(10, 7)
  wilayah_kerja   String

  users  User[]

  @@map("puskesmas")
}
```

#### Model: `notifications_log`
```prisma
model NotificationLog {
  id                     String              @id @default(uuid()) @db.Uuid
  pregnancy_profile_id   String              @db.Uuid
  channel                NotificationChannel
  message                String
  status                 NotificationStatus  @default(pending)
  sent_at                DateTime?
  created_at             DateTime            @default(now())

  pregnancy_profile  PregnancyProfile  @relation(fields: [pregnancy_profile_id], references: [id])

  @@map("notifications_log")
}
```

#### Model: `reminders`
```prisma
model Reminder {
  id                     String         @id @default(uuid()) @db.Uuid
  pregnancy_profile_id   String         @db.Uuid
  reminder_type          ReminderType
  cadence_days           Int
  next_trigger_at        DateTime
  last_sent_at           DateTime?
  status                 ReminderStatus @default(active)

  pregnancy_profile  PregnancyProfile  @relation(fields: [pregnancy_profile_id], references: [id])

  @@index([next_trigger_at])
  @@map("reminders")
}
```

#### Model: `sync_queue`
```prisma
model SyncQueue {
  id                  String          @id @default(uuid()) @db.Uuid
  device_uuid         String
  payload_type        SyncPayloadType
  payload             Json
  client_created_at   DateTime
  synced_at           DateTime?
  status              SyncStatus      @default(pending)
  client_uuid         String          @unique @db.Uuid

  @@map("sync_queue")
}
```

#### Model: `consultations` & `chat_messages`
```prisma
model Consultation {
  id                     String    @id @default(uuid()) @db.Uuid
  pregnancy_profile_id   String    @db.Uuid
  status                 String    @default("open")
  created_at             DateTime  @default(now())
  updated_at             DateTime  @updatedAt

  @@map("consultations")
}

model ChatMessage {
  id                     String    @id @default(uuid()) @db.Uuid
  pregnancy_profile_id   String    @db.Uuid
  sender_type            String    // 'user' | 'ai'
  message                String
  created_at             DateTime  @default(now())

  @@map("chat_messages")
}
```

### 2. Jalankan Migrasi
```bash
npx prisma migrate dev --name init
```
Ini akan:
- Membuat folder `prisma/migrations/` dengan SQL migrasi
- Menjalankan migrasi ke database
- Auto-generate Prisma Client

### 3. Generate Prisma Client (kalau belum)
```bash
npx prisma generate
```

### 4. Tambah scripts di `package.json`
```json
{
  "scripts": {
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "prisma:studio": "prisma studio",
    "prisma:seed": "ts-node prisma/seed.ts"
  }
}
```

### 5. Pastikan `.gitignore` termasuk
```
node_modules/
.env
dist/
```

Tapi **JANGAN** gitignore `prisma/schema.prisma` dan `prisma/migrations/` — ini harus di-commit.

## Testing
- `npx prisma validate` harus sukses
- `npx prisma migrate dev --name init` harus sukses
- `npm run build` harus sukses
- Cek bahwa semua tabel terbuat di PostgreSQL (bisa pakai `npx prisma studio` untuk verifikasi visual)

## Postman Collection
Generate file: `postman/02-prisma-schema.postman_collection.json`
- Tidak ada endpoint baru di task ini, tapi buat placeholder collection untuk dokumentasi schema

## Konvensi Penting
- Semua nama tabel: `snake_case` (pakai `@@map("table_name")`)
- Semua kolom: `snake_case` (Prisma field names langsung snake_case)
- Semua PK: UUID v4, auto-generated (`@default(uuid())`)
- Semua timestamp: UTC (default behavior Prisma + PostgreSQL)
- Gunakan Prisma enum yang nilainya sinkron dengan enum di `src/common/constants/index.ts` (Task 01)
- Index database sesuai PRD section 10.2 didefinisikan langsung di schema (`@@index`, `@unique`)
