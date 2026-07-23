# Task 01 — Project Setup, Config & Database Foundation

## Tujuan
Setup fondasi project NestJS: install semua dependency, konfigurasi environment validation, koneksi database PostgreSQL via Prisma, global pipes/filters/interceptors, dan `.env.example`.

## Scope
- Install semua dependency yang dibutuhkan seluruh project
- Setup `ConfigModule` dengan validasi Joi
- Setup Prisma + PostgreSQL (install `prisma` & `@prisma/client`, init Prisma)
- Setup Redis connection
- Global validation pipe (`class-validator` + `class-transformer`)
- Global exception filter (jangan bocorin stack trace/SQL)
- Global response interceptor (format response konsisten)
- Rate limiting setup (`@nestjs/throttler`)
- `.env.example` dengan placeholder
- `.gitignore` pastikan `.env` masuk

## Detail Implementasi

### 1. Install Dependencies
```bash
npm install @nestjs/config joi @prisma/client @nestjs/jwt @nestjs/passport passport passport-jwt class-validator class-transformer @nestjs/throttler @nestjs/bullmq bullmq ioredis @nestjs/axios axios bcrypt uuid
npm install -D prisma @types/passport-jwt @types/bcrypt @types/uuid
```

> **Catatan:** `prisma` di-install sebagai devDependency (CLI tool), `@prisma/client` di-install sebagai dependency (runtime client). JANGAN install `@nestjs/typeorm` atau `typeorm`.

### 2. Init Prisma
```bash
npx prisma init
```
Ini akan membuat:
- `prisma/schema.prisma` — file schema utama
- Update `.env` dengan `DATABASE_URL` placeholder

### 3. File: `src/prisma/prisma.module.ts` & `src/prisma/prisma.service.ts`
- `PrismaService` extends `PrismaClient` dan implements `OnModuleInit`:
  ```typescript
  @Injectable()
  export class PrismaService extends PrismaClient implements OnModuleInit {
    async onModuleInit() {
      await this.$connect();
    }
  }
  ```
- `PrismaModule` adalah `@Global()` module yang provides & exports `PrismaService`
- Karena `@Global()`, semua module lain bisa langsung inject `PrismaService` tanpa import `PrismaModule` berulang kali

### 4. File: `src/app.module.ts`
- Import `ConfigModule.forRoot()` dengan Joi validation schema:
  ```
  DATABASE_URL: Joi.string().required()
  REDIS_URL: Joi.string().required()
  JWT_SECRET: Joi.string().min(32).required()
  INTERNAL_SERVICE_TOKEN: Joi.string().min(32).required()
  FONNTE_API_KEY: Joi.string().required()
  AI_SERVICE_URL: Joi.string().uri().required()
  NOMINATIM_BASE_URL: Joi.string().uri().default('https://nominatim.openstreetmap.org')
  ```
- Import `PrismaModule` (global, cukup sekali di AppModule)
- Import `ThrottlerModule.forRoot()` default config
- Import `BullModule.forRootAsync()` pakai Redis URL dari config
- **JANGAN** import `TypeOrmModule` — project ini pakai Prisma

### 5. File: `src/common/filters/global-exception.filter.ts`
- Catch semua exception
- Response format: `{ status_code, message, error, timestamp }`
- JANGAN expose stack trace, SQL query, atau env var
- Log error detail ke console (server-side only)

### 6. File: `src/common/interceptors/response.interceptor.ts`
- Wrap semua response sukses ke format: `{ status_code: 200, message: 'success', data: ... }`

### 7. File: `src/common/interceptors/request-id.interceptor.ts`
- Generate `X-Request-Id` header kalau belum ada, attach ke request context

### 8. File: `src/main.ts`
- Enable global validation pipe: `whitelist: true, forbidNonWhitelisted: true, transform: true`
- Apply global exception filter
- Apply global interceptors
- CORS enable
- Port dari env atau default 3000

### 9. File: `.env.example`
```
DATABASE_URL=postgresql://user:password@localhost:5432/maternin
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret-minimum-32-characters-long
INTERNAL_SERVICE_TOKEN=your-internal-token-minimum-32-chars
FONNTE_API_KEY=your-fonnte-api-key
AI_SERVICE_URL=http://localhost:8000
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
```

### 10. File: `src/common/constants/index.ts`
- Define enum-enum yang akan dipakai di seluruh project:
  ```ts
  export enum UserRole { IBU_HAMIL = 'ibu_hamil', BIDAN = 'bidan', KADER = 'kader', ADMIN = 'admin' }
  export enum PregnancyStatus { HAMIL = 'hamil', NIFAS = 'nifas', SELESAI = 'selesai' }
  export enum RiskBadge { HIJAU = 'hijau', KUNING = 'kuning', MERAH = 'merah' }
  export enum AncSource { SELF = 'self', NAKES = 'nakes', KADER_OFFLINE = 'kader_offline' }
  export enum CheckinType { PREGNANCY = 'pregnancy', POSTPARTUM = 'postpartum' }
  export enum BleedingLevel { NORMAL = 'normal', BANYAK = 'banyak', SANGAT_BANYAK = 'sangat_banyak' }
  export enum WoundCondition { BAIK = 'baik', BAU = 'bau', BENGKAK_MERAH = 'bengkak_merah' }
  export enum MoodFlag { BAIK = 'baik', KADANG_SEDIH = 'kadang_sedih', SERING_SEDIH = 'sering_sedih' }
  export enum NotificationChannel { WA_PATIENT = 'wa_patient', WA_BIDAN = 'wa_bidan', WA_FAMILY = 'wa_family', IN_APP = 'in_app' }
  export enum NotificationStatus { PENDING = 'pending', SENT = 'sent', FAILED = 'failed', NO_DEVICE_FALLBACK = 'no_device_fallback' }
  export enum ReminderType { ANC_CHECKUP = 'anc_checkup', POSTPARTUM_CHECKIN = 'postpartum_checkin' }
  export enum ReminderStatus { ACTIVE = 'active', PAUSED = 'paused', DONE = 'done' }
  export enum NotifyOn { MERAH_ONLY = 'merah_only', SEMUA_PERUBAHAN = 'semua_perubahan' }
  export enum SyncPayloadType { ANC_RECORD = 'anc_record', SYMPTOM_CHECKIN = 'symptom_checkin' }
  export enum SyncStatus { PENDING = 'pending', PROCESSED = 'processed', FAILED = 'failed' }
  export enum SymptomSource { SELF = 'self', KADER_OFFLINE = 'kader_offline' }
  ```

> **Catatan:** Enum di constants ini dipakai untuk validasi DTO (`class-validator`). Prisma juga punya enum sendiri yang didefinisikan di `schema.prisma` — keduanya harus sinkron nilainya.

## Testing
- `npm run build` harus sukses tanpa error
- `npx prisma validate` harus sukses (validasi schema)
- App harus bisa start (tanpa DB/Redis pun config validation harus jalan — test dengan env var lengkap)
- Test: kirim request ke endpoint yang tidak ada, pastikan global exception filter return format yang benar (bukan stack trace)

## Postman Collection
Generate file: `postman/01-project-setup.postman_collection.json`
- Request: `GET /` → pastikan app respond
- Request: `GET /nonexistent` → pastikan error format sesuai (no stack trace)

## Konvensi
- Semua nama tabel, kolom, field JSON: `snake_case`
- Semua timestamp: UTC
- Primary key: UUID
- ORM: **Prisma** (bukan TypeORM)
