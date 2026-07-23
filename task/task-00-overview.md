# MaternIn Backend — Task Overview

**Total: 17 Tasks** — Urut dari fondasi sampai testing akhir.
Setiap task menghasilkan kode + Postman collection di folder `postman/`.

---

## 📋 Daftar Task

| No | File Task | Scope | Estimasi Kompleksitas |
|----|-----------|-------|----------------------|
| 01 | `task-01-project-setup-config.md` | Install dependency, ConfigModule (Joi), Prisma setup, Redis, global pipes/filters/interceptors, `.env.example`, enum constants | 🟡 Medium |
| 02 | `task-02-prisma-schema.md` | Prisma schema lengkap (12 model + relasi + index), PrismaService, `npx prisma migrate dev` (PRD section 3 & 10.2) | 🟡 Medium |
| 03 | `task-03-auth-module.md` | Register, login, JWT strategy, Passport, role guard, internal token guard, rate limiting login | 🟡 Medium |
| 04 | `task-04-users-facilities-module.md` | Users profile CRUD, Puskesmas CRUD (admin), Nominatim proxy + Redis cache | 🟡 Medium |
| 05 | `task-05-pregnancy-profiles-module.md` | Pregnancy profiles CRUD, auto HPL, status transition (hamil→nifas→selesai), ownership guard | 🟡 Medium |
| 06 | `task-06-anc-records-module.md` | ANC records CRUD, idempotency `client_uuid`, latest ANC query, access control | 🟢 Low-Medium |
| 07 | `task-07-symptom-checkins-module.md` | Symptom checkin + panggil AI Service triage, timeout 5s, retry BullMQ, rate limiting | 🔴 High |
| 08 | `task-08-risk-assessments-module.md` | Internal callback `POST /internal/risk-assessments`, publik read histori, cache invalidation, update reminder cadence | 🔴 High |
| 09 | `task-09-postpartum-module.md` | Postpartum logs CRUD + AI Service evaluate + internal callback `POST /internal/postpartum-flags` | 🟡 Medium |
| 10 | `task-10-family-circle-module.md` | Family circle CRUD, ownership validation, notification preference filtering | 🟢 Low |
| 11 | `task-11-reminders-module.md` | BullMQ reminder scheduler, dynamic cadence (risk badge & postpartum day), cron job | 🔴 High |
| 12 | `task-12-notifications-module.md` | Fonnte WA client, BullMQ notification processor, retry 3x exponential backoff, notification log | 🟡 Medium |
| 13 | `task-13-bidan-dashboard.md` | `GET /bidan/patients` (sorted risk), visit brief, statistics, Redis cache | 🟡 Medium |
| 14 | `task-14-sync-offline-module.md` | `POST /sync/batch`, idempotency, last-write-wins, trigger AI pipeline per record | 🔴 High |
| 15 | `task-15-chat-consultations-module.md` | Chat proxy ke AI Service, simpan histori `chat_messages`, basic consultations | 🟢 Low-Medium |
| 16 | `task-16-reports-module.md` | `GET /reports/monthly` MDSR, aggregasi data per puskesmas per bulan | 🟡 Medium |
| 17 | `task-17-testing-seeding-verification.md` | Unit tests semua service, database seeder (Prisma), checklist verifikasi PRD, end-to-end Postman flow | 🟡 Medium |

---

## 🔗 Dependency Antar Task

```
Task 01 (Setup)
  └── Task 02 (Prisma Schema + PrismaService) ← semua model wajib ada dulu
        └── Task 03 (Auth) ← fondasi auth
              ├── Task 04 (Users + Facilities)
              ├── Task 05 (Pregnancy Profiles) ← fondasi data
              │     ├── Task 06 (ANC Records)
              │     │     └── Task 07 (Symptom Checkins + AI Service)
              │     │           └── Task 08 (Risk Assessments + Callback)
              │     │                 └── Task 11 (Reminders)
              │     │                       └── Task 12 (Notifications)
              │     ├── Task 09 (Postpartum)
              │     ├── Task 10 (Family Circle)
              │     ├── Task 13 (Bidan Dashboard)
              │     ├── Task 14 (Sync Offline)
              │     ├── Task 15 (Chat + Consultations)
              │     └── Task 16 (Reports)
              └── Task 17 (Testing + Final Verification) ← terakhir
```

---

## ✅ PRD Coverage Checklist

| PRD Section | Covered By Task |
|-------------|-----------------|
| 1. Tech stack (Prisma) | Task 01, 02 |
| 2. Peran NestJS | Task 01, 07, 08, 09 |
| 3.1 users | Task 02, 03, 04 |
| 3.2 pregnancy_profiles | Task 02, 05 |
| 3.3 anc_records | Task 02, 06 |
| 3.4 symptom_checkins | Task 02, 07 |
| 3.5 risk_assessments | Task 02, 08 |
| 3.6 postpartum_logs | Task 02, 09 |
| 3.7 family_circle | Task 02, 10 |
| 3.8 puskesmas | Task 02, 04 |
| 3.9 notifications_log | Task 02, 12 |
| 3.10 reminders | Task 02, 11 |
| 3.11 sync_queue | Task 02, 14 |
| 3.12 consultations, chat_messages | Task 02, 15 |
| 4. Struktur module | Task 01–16 (semua module) |
| 5.1 Endpoint publik | Task 03–16 |
| 5.2 Endpoint internal | Task 08, 09 |
| 6. Kontrak AI Service | Task 07, 09, 15 (pemanggilan) |
| 7.1 Risk badge enum | Task 01 (constants) |
| 7.2 Cadence reminder | Task 11 |
| 7.3 Sync offline | Task 14 |
| 8. Auth & role-based access | Task 03 |
| 9. Environment variables | Task 01 |
| 10.1 Keamanan credential | Task 01, 17 (verifikasi) |
| 10.2 Index database | Task 02 (Prisma schema) |
| 10.3 Caching Redis | Task 04, 08, 13 |
| 10.4 Reliability | Task 07, 09, 12 |
| 10.5 Checklist | Task 17 |
| 11. Urutan implementasi | Urutan task 01–17 |

---

## 📌 Instruksi untuk AI Agent

Saat mengerjakan setiap task:
1. **Baca file task** secara penuh sebelum mulai coding
2. **Kerjakan HANYA scope yang tertulis** di task tersebut
3. **Pastikan `npm run build` sukses** sebelum lanjut
4. **Generate Postman collection** sesuai instruksi di setiap task (simpan di folder `postman/`)
5. **Gunakan enum/constants** dari `src/common/constants/index.ts` (dibuat di Task 01)
6. **Jangan hardcode credential** — semua lewat env var
7. **Semua nama tabel/kolom/field**: `snake_case`, timestamp UTC, PK uuid
8. **Gunakan `PrismaService`** untuk semua interaksi database — BUKAN TypeORM Repository
9. **Prisma schema** didefinisikan di `prisma/schema.prisma` — jangan buat entity files terpisah
