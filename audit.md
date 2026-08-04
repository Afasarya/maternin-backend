# Audit Pengerjaan Backend MaternIn

**Tanggal audit:** 4 Agustus 2026  
**Ruang lingkup:** progres pengerjaan proyek dari fondasi sampai verifikasi akhir.  
**Dasar audit:** dokumen Task 00–17, source code, Prisma schema dan migrasi, seed, unit test, Postman collection, README, serta status Git.

## 1. Ringkasan

Backend MaternIn telah memiliki implementasi inti Task 01–16. Seluruh modul utama terpasang dalam `AppModule`, build berhasil, Prisma schema valid, dan 314 unit test dari 33 test suite lulus. Implementasi belum dapat dinyatakan selesai penuh karena Task 17, E2E lintas layanan, dokumentasi operasional, kelengkapan Postman, dan verifikasi database nyata belum lengkap.

| Tahap | Status |
|---|---|
| Task 01 — Setup dan konfigurasi | Selesai secara kode |
| Task 02 — Database dan entities | Selesai |
| Task 03 — Auth | Sebagian |
| Task 04 — Users dan facilities | Sebagian |
| Task 05 — Pregnancy profiles | Sebagian kuat |
| Task 06 — ANC records | Sebagian kuat |
| Task 07 — Symptom check-ins | Selesai secara kode |
| Task 08 — Risk assessments | Selesai secara kode |
| Task 09 — Postpartum | Selesai secara kode |
| Task 10 — Family circle | Selesai secara kode |
| Task 11 — Reminders | Selesai secara kode |
| Task 12 — Notifications | Selesai secara kode |
| Task 13 — Dashboard bidan | Selesai secara kode |
| Task 14 — Sync offline | Selesai di workspace, belum tercatat Git |
| Task 15 — Chat dan consultations | Selesai di workspace, belum tercatat Git |
| Task 16 — Reports | Selesai secara kode, deliverable pendukung belum lengkap |
| Task 17 — Testing, seeding, verifikasi | Sebagian |

## 2. Riwayat pengerjaan berdasarkan Git

Commit yang teramati, urut dari awal:

1. `b7dcfea` — `first commit`
2. `1a5ed6d` — `fix: git ignore`
3. `3944e04` — `Remove task folder from repository`
4. `452fa54` — `feat: pregnancy anc logic and db`
5. `8871825` — `fix:responses auth and user`
6. `050e664` — `fix:symptons-checkins bug`
7. `ad90af3` — `feat: postpartum module`
8. `f968ef7` — `feat:family circle module`
9. `82adcaf` — `feat: module notifications`
10. `2bc92ef` — `feat: dashboard bidan module`

`HEAD`, `main`, dan `origin/main` berada pada `2bc92ef`. Kondisi workspace lebih maju daripada repository remote. Perubahan dan file baru terkait sync, chat, consultations, reports, schema, seed, serta migrasi lanjutan belum seluruhnya masuk commit.

## 3. Task 00 — Gambaran dan struktur proyek

### Sudah dikerjakan

- Pekerjaan dibagi menjadi Task 01–17.
- Direktori modul Task 03–16 tersedia dalam `src/`.
- Seluruh modul domain utama dipasang dalam `src/app.module.ts`.
- Controller dan route tersedia untuk auth, users, facilities, pregnancy profiles, ANC, symptom check-in, risk assessment, postpartum, family circle, reminders, notifications, bidan, sync, chat, consultations, dan reports.

### Status

**Selesai secara struktur.**

### Catatan audit

- `README.md` masih berupa template NestJS.
- Nama dokumen Task 02 pada overview berbeda dari nama file aktual.
- Tidak semua task memiliki deliverable Postman lengkap.

## 4. Task 01 — Setup dan konfigurasi

### Sudah dikerjakan

- NestJS 11 dan TypeScript.
- Prisma 7.9 dengan PostgreSQL driver adapter.
- Konfigurasi global dengan validasi Joi.
- Validasi environment untuk database, Redis, JWT, internal token, Fonnte, AI service, dan Nominatim.
- `PrismaModule` global dan `PrismaService`.
- BullMQ menggunakan Redis.
- Global throttling.
- Global validation pipe dengan whitelist, transform, dan larangan properti asing.
- Global exception filter.
- Response interceptor dan request-ID interceptor.
- CORS dan konfigurasi port.
- `.env` diabaikan Git dan `.env.example` tersedia.
- Dependency JWT, Passport, bcrypt, BullMQ, Redis, Axios, Joi, Prisma, serta validator tersedia.
- Postman collection Task 01 tersedia lokal.

### Status

**Selesai secara kode.**

### Belum lengkap

- README belum menjelaskan setup MaternIn, PostgreSQL, Redis, migrasi, seed, akun demo, AI service, Fonnte, dan endpoint.
- Aturan `.gitignore` membuat sebagian file task dan Postman tidak terlacak.
- Deployment wajib menjalankan `prisma generate` karena generated client diabaikan Git.

## 5. Task 02 — Database dan entities

### Sudah dikerjakan

Prisma schema memuat 13 model:

1. `User`
2. `PregnancyProfile`
3. `AncRecord`
4. `SymptomCheckin`
5. `RiskAssessment`
6. `PostpartumLog`
7. `FamilyCircle`
8. `Puskesmas`
9. `NotificationLog`
10. `Reminder`
11. `SyncQueue`
12. `Consultation`
13. `ChatMessage`

Enum domain tersedia untuk role, status dan outcome kehamilan, risk badge, ANC source, check-in, postpartum, notification, reminder, sync, chat, dan consultation.

Migrasi telah menangani:

- tabel, relasi, foreign key, dan index dasar;
- pregnancy outcome dan `ended_at`;
- idempotensi ANC, symptom check-in, postpartum, reminder, sync, dan risk assessment;
- metadata evaluasi postpartum;
- index family circle, notification history, sync device, chat, dan consultation;
- constraint unique penting untuk mencegah duplikasi.

### Status

**Selesai.** Prisma schema valid.

### Belum diverifikasi

- Status migrasi pada PostgreSQL nyata.
- Migrasi Task 14/15 belum seluruhnya tercatat Git.

## 6. Task 03 — Auth

### Sudah dikerjakan

- Endpoint `POST /auth/register`.
- Endpoint `POST /auth/login`.
- Password hashing dengan bcrypt.
- JWT dan Passport strategy.
- `JwtAuthGuard`, `RolesGuard`, dan `InternalAuthGuard`.
- Decorator role dan current user.
- Rate limit pada login.
- Postman collection Task 03 tersedia lokal.

### Status

**Sebagian.**

### Belum lengkap

- Unit test khusus `AuthService` dan auth controller tidak ditemukan.
- Skenario register, duplicate phone, wrong password, user not found, JWT payload, dan rate limit belum terbukti melalui test khusus auth.

## 7. Task 04 — Users dan facilities

### Sudah dikerjakan

Endpoint users:

- `GET /users/me`
- `PATCH /users/me`
- `GET /users/:id`

Endpoint facilities:

- `POST /facilities/puskesmas`
- `GET /facilities/puskesmas`
- `GET /facilities/puskesmas/:id`
- `PATCH /facilities/puskesmas/:id`
- `DELETE /facilities/puskesmas/:id`
- `GET /facilities/nearby`

Fitur:

- baca dan ubah profil;
- detail user;
- CRUD dan pagination puskesmas;
- nearby facility proxy;
- Redis cache 24 jam;
- role guard;
- unit test service users dan facilities.

### Status

**Sebagian.**

### Belum lengkap

- Controller test users dan facilities tidak ditemukan.
- Integrasi nyata Redis dan Nominatim belum diverifikasi.

## 8. Task 05 — Pregnancy profiles

### Sudah dikerjakan

- `POST /pregnancy-profiles`
- `GET /pregnancy-profiles`
- `GET /pregnancy-profiles/:id`
- `PATCH /pregnancy-profiles/:id`
- `PATCH /pregnancy-profiles/:id/status`
- Perhitungan HPL dari HPHT.
- Pembuatan profil oleh ibu, bidan, atau kader sesuai akses.
- Pagination, filter status, ownership, dan scoping puskesmas.
- Lifecycle `hamil`, `nifas`, dan `selesai`.
- Outcome diwajibkan ketika keluar dari status `hamil`.
- Dukungan alur persalinan dan keguguran.
- Unit test service mencakup banyak jalur lifecycle dan akses.

### Status

**Sebagian kuat.**

### Belum lengkap

- Controller test tidak ditemukan.
- Integrasi lintas modul untuk auto-create atau stop reminder belum diuji secara E2E.

## 9. Task 06 — ANC records

### Sudah dikerjakan

- `POST /anc-records`
- `GET /anc-records`
- `GET /anc-records/latest`
- `GET /anc-records/:id`
- Source otomatis berdasarkan role.
- Idempotensi melalui `client_uuid`.
- Last-write-wins untuk data offline.
- Perlindungan UUID lintas profil.
- Penanganan race unique constraint.
- Pagination, latest ANC, ownership, dan wilayah.
- Unit test service luas.

### Status

**Sebagian kuat.**

### Belum lengkap

- Controller test tidak ditemukan.
- Integrasi database nyata belum diverifikasi.

## 10. Task 07 — Symptom check-ins dan AI triage

### Sudah dikerjakan

- `POST /symptom-checkins`
- `GET /symptom-checkins`
- `GET /symptom-checkins/:id`
- Akses patient dan kader.
- Rate limit 10 request per menit.
- Idempotensi dan ownership.
- Last-write-wins untuk sync offline.
- Latest ANC disertakan dalam pipeline triage.
- AI client dengan timeout 5 detik.
- Header internal token dan request ID.
- Hasil AI disimpan sebagai risk assessment.
- Timeout menghasilkan status processing.
- Retry BullMQ dengan exponential backoff.
- Penanganan concurrent unique constraint.
- Test service, controller, AI client, dan rate limit tersedia.

### Status

**Selesai secara kode.**

### Catatan audit

Postpartum tidak lagi diproses sebagai symptom check-in. Implementasi terbaru memakai `postpartum_logs`, sesuai PRD dan schema terbaru.

## 11. Task 08 — Risk assessments

### Sudah dikerjakan

- `POST /internal/risk-assessments`
- `GET /pregnancy-profiles/:id/risk-assessments`
- `GET /risk-assessments/latest`
- `GET /risk-assessments/:id`
- Internal callback dilindungi token.
- Callback replay idempotent.
- Unique assessment per symptom check-in.
- Last-write-wins replacement.
- Cache latest risk 10 menit.
- Version-aware cache write dan invalidation.
- Update reminder cadence.
- Invalidation cache dashboard bidan.
- Histori paginated, ownership, dan scoping.
- Test service dan controller tersedia.

### Status

**Selesai secara kode.**

### Belum diverifikasi

- Integrasi Redis, database, dan callback AI nyata.

## 12. Task 09 — Postpartum

### Sudah dikerjakan

- `POST /postpartum-logs`
- `POST /internal/postpartum-flags`
- `GET /postpartum-logs`
- `GET /postpartum-logs/:id`
- Hanya menerima profil berstatus `nifas`.
- Akses patient dan kader sesuai wilayah.
- Idempotensi `client_uuid`.
- AI postpartum evaluation.
- Status processing dan BullMQ retry saat timeout.
- Callback internal dilindungi token.
- Penyimpanan red flag, evaluation reason, mental-health flag, dan evaluation time.
- Update cadence postpartum.
- Replay idempotent menghasilkan HTTP 200.
- Pagination dan histori.
- Controller dan service test tersedia.

### Status

**Selesai secara kode.**

## 13. Task 10 — Family circle

### Sudah dikerjakan

- `POST /family-circle`
- `GET /family-circle`
- `GET /family-circle/:id`
- `PATCH /family-circle/:id`
- `DELETE /family-circle/:id`
- Patient mengelola kontak profil sendiri.
- Bidan dan admin membaca sesuai akses.
- Pagination, detail, update, dan delete.
- Filter penerima notifikasi berdasarkan risk badge dan preferensi.
- Controller dan service test tersedia.

### Status

**Selesai secara kode.**

## 14. Task 11 — Reminders

### Sudah dikerjakan

- `GET /reminders`
- `GET /reminders/:id`
- `PATCH /reminders/:id/pause`
- `PATCH /reminders/:id/resume`
- Cadence ANC: merah 3 hari, kuning 7 hari, hijau 14 hari.
- Cadence postpartum sesuai rentang hari nifas.
- Atomic upsert per profile dan reminder type.
- Due reminder query serta advancement trigger.
- Pause dan resume.
- BullMQ scheduler setiap jam.
- Exponential backoff.
- Test service, controller, processor, cadence, dan scheduler tersedia.

### Status

**Selesai secara kode.**

### Belum diverifikasi

- Scheduler dan Redis nyata.

## 15. Task 12 — Notifications

### Sudah dikerjakan

- `GET /notifications`
- `GET /notifications/:id`
- Fonnte client dengan timeout 10 detik.
- API key dari configuration service.
- Notification queue dan exponential retry.
- Final failure logging.
- Routing notifikasi ke patient, bidan, dan family circle.
- Notification history, pagination, filter channel, dan filter status.
- Test service, controller, processor, dan Fonnte client tersedia.

### Status

**Selesai secara kode.**

### Belum diverifikasi

- Pengiriman melalui Fonnte nyata.

## 16. Task 13 — Dashboard bidan

### Sudah dikerjakan

- `GET /bidan/patients`
- `GET /bidan/patients/:id/visit-brief`
- `GET /bidan/statistics`
- Akses bidan dan admin.
- Scoping puskesmas untuk bidan dan akses global untuk admin.
- Filter risk badge dan pencarian.
- Risk sorting sebelum pagination.
- Latest risk dan check-in.
- Redis cache snapshot 5 menit.
- Cache bypass untuk global admin.
- Visit brief dan statistik.
- Controller serta service test tersedia.

### Status

**Selesai secara kode.**

## 17. Task 14 — Sync offline

### Sudah dikerjakan

- `POST /sync/batch`
- `GET /sync/status`
- Akses khusus kader.
- Nested DTO validation.
- Idempotensi `client_uuid`.
- Last-write-wins berdasarkan `client_created_at`.
- Timestamp lama atau sama di-skip.
- Payload type tidak dapat diubah.
- Data diteruskan melalui service ANC dan symptom check-in.
- Mixed batch ANC dan symptom check-in.
- Status pending, processed, dan failed.
- Retry processor serta exponential backoff.
- HTTP 201 untuk batch baru dan 200 untuk replay atau batch kosong.
- Test service, controller, dan processor tersedia.

### Status

**Selesai di workspace.**

### Catatan audit

Direktori `src/sync/`, migrasi, dan Postman Task 14 belum seluruhnya terlacak Git. Implementasi belum tersedia pada `HEAD` atau remote.

## 18. Task 15 — Chat dan consultations

### Sudah dikerjakan

Endpoint chat:

- `POST /chat`
- `GET /chat/history`
- `GET /chat/history/:id`

Endpoint consultations:

- `POST /consultations`
- `GET /consultations`
- `GET /consultations/:id`
- `PATCH /consultations/:id/status`

Fitur:

- Chat hanya untuk patient pemilik profil.
- Pesan user dan balasan AI disimpan.
- Disclaimer AI disimpan.
- `reply_to_message_id` mencegah duplikasi balasan.
- Timeout menghasilkan status processing dan retry queue.
- Histori kronologis dengan pagination.
- Consultation mendukung create, list, filter, detail, dan perubahan status.
- Ownership dan regional access.
- Test service, controller, dan processor tersedia.

### Status

**Selesai di workspace.**

### Catatan audit

Chat, consultations, migrasi, dan Postman Task 15 belum seluruhnya terlacak Git. Integrasi AI nyata belum diverifikasi.

## 19. Task 16 — Reports

### Sudah dikerjakan

- `GET /reports/monthly`
- Akses bidan dan admin.
- Filter bulan dan tahun opsional.
- UTC half-open date range.
- Laporan regional untuk bidan dan global untuk admin.
- Ringkasan kehamilan, ANC, symptom check-in, latest-risk distribution, high-risk details, postpartum, dan notification.
- Empty report valid.
- Default bulan menggunakan UTC.
- Controller dan service test tersedia.

### Status

**Selesai secara kode.**

### Belum lengkap

- `postman/16-reports.postman_collection.json` tidak ditemukan.
- Modul reports belum tercatat Git.
- Query terhadap PostgreSQL nyata belum diverifikasi.

## 20. Task 17 — Testing, seeding, dan verifikasi akhir

### Hasil verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Unit test | 33 suite, 314 test lulus |
| Build NestJS | Lulus |
| Prisma validate | Lulus |
| E2E penuh | Belum tersedia |
| Lint | Belum diverifikasi |
| Migrasi pada DB nyata | Belum diverifikasi |
| Seed pada DB nyata | Belum diverifikasi |
| Postman end-to-end | Belum tersedia |

### Test yang tersedia

Test mencakup app, users service, pregnancy profiles, ANC, symptom check-in, AI client, risk assessment, postpartum, family circle, reminders, notifications, bidan, sync, chat, consultations, reports, dan facilities service.

### Test yang belum ditemukan

- `AuthService` dan auth controller.
- Users controller.
- Facilities controller.
- Pregnancy profiles controller.
- ANC controller.
- Global exception filter.
- Response dan request-ID interceptor.
- Guard secara terpisah.

### E2E

`test/app.e2e-spec.ts` hanya menguji `GET /`. Belum ada E2E nyata untuk auth, database, Redis, AI callback, queue, Fonnte, atau full user journey.

### Seeder

`prisma/seed.ts` telah memiliki:

- production guard;
- validasi `DATABASE_URL`;
- Prisma PostgreSQL adapter;
- bcrypt cost 12;
- deterministic UUID;
- upsert agar dapat dijalankan ulang;
- data puskesmas, user, pregnancy profile, ANC, symptom check-in, risk assessment, postpartum, family contact, reminder, notification, consultation, dan chat;
- verifikasi jumlah data setelah seed.

Perbedaan terhadap target Task 17:

- target 5 ANC record, seed aktual 1;
- skenario pregnancy profile berstatus `selesai` belum terbukti;
- target 5 notification log, seed aktual 4.

### Deliverable yang belum tersedia

- `src/common/seeders/verify-checklist.ts`
- `postman/17-testing-seed.postman_collection.json`
- `postman/maternin-environment.json`

### Status

**Sebagian.**

## 21. Audit Postman

### Tersedia lokal

Collection Task 01–15 tersedia lokal.

### Belum tersedia

- Task 16.
- Task 17.
- Postman environment.

### Masalah pencatatan Git

Aturan `.gitignore` mengabaikan `postman/*` lalu hanya mengizinkan sebagian file. Task 05, 06, 14, 15, 16, dan 17 belum tercatat secara konsisten.

## 22. Audit dokumentasi

### README

**Belum disesuaikan.** `README.md` masih menjelaskan starter NestJS dan belum menjadi panduan operasional MaternIn.

### Dokumen task

Task 00–17 tersedia dalam workspace, tetapi aturan `.gitignore` mengecualikan sebagian besar folder `task/` dari Git.

### PRD

PRD telah memuat penyesuaian domain terbaru, termasuk pregnancy outcome, pemisahan postpartum, Decimal serialization, status HTTP idempotent, last-write-wins, statistik admin global, dan callback replay.

## 23. Temuan utama

### Prioritas tinggi

1. Workspace lebih maju daripada repository remote; Task 14–16 dan perubahan penting belum commit.
2. Task 17 belum selesai penuh.
3. E2E lintas modul dan layanan belum tersedia.
4. README masih template NestJS.
5. Postman Task 16/17 dan environment belum tersedia.
6. Migrasi serta seed belum diverifikasi terhadap PostgreSQL nyata.

### Prioritas menengah

1. Auth dan beberapa controller belum memiliki unit test khusus.
2. Integrasi Redis/BullMQ belum diuji end-to-end.
3. Integrasi Nominatim, AI service, dan Fonnte baru terbukti melalui kode atau mock.
4. Seeder belum memenuhi seluruh jumlah dan skenario minimum Task 17.
5. Aturan `.gitignore` membuat pencatatan task dan Postman tidak konsisten.

## 24. Kesimpulan

Implementasi inti Task 01–16 sebagian besar telah dikerjakan dan dapat dibangun. Schema serta migrasi memiliki constraint idempotensi yang kuat. Lifecycle kehamilan, offline last-write-wins, internal callback protection, AI timeout, request tracing, cache, retry queue, reminder, notification, dashboard, chat, consultation, dan report telah tersedia secara kode.

Proyek belum selesai penuh berdasarkan Task 17. Kekurangan utama berada pada E2E dengan PostgreSQL dan Redis, verifikasi migrasi dan seed nyata, kelengkapan test auth/controller, Postman Task 16–17, Postman environment, automated verification checklist, README proyek, dan commit seluruh perubahan workspace.
