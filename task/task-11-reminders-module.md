# Task 11 — Reminders Module (BullMQ Scheduler)

## Tujuan
Implementasi sistem reminder otomatis yang cadence-nya dinamis berdasarkan risk badge (untuk ANC) dan day_number (untuk postpartum), menggunakan BullMQ scheduler.

## Scope
- Tabel `reminders` management
- Auto-create reminder saat pregnancy profile dibuat
- Auto-update cadence saat risk assessment baru masuk
- BullMQ cron job untuk cek dan trigger reminder
- Postpartum reminder dengan cadence berdasarkan day_number

## Detail Implementasi

### 1. File: `src/reminders/reminders.module.ts`
- Import: `BullModule.registerQueue({ name: 'reminders' })`, `PregnancyProfilesModule`
- Providers: `RemindersService`, `RemindersProcessor`
- Controllers: `RemindersController`
- Export: `RemindersService`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/reminders/reminders.service.ts`
- Inject `PrismaService`
- `createAncReminder(profileId, riskBadge)`:
  - Hitung cadence berdasarkan risk badge:
    - merah → 3 hari
    - kuning → 7 hari
    - hijau → 14 hari
  - Set `next_trigger_at = now() + cadence_days`
  - Insert atau update reminder (upsert by profileId + type):
    ```typescript
    await this.prisma.reminder.upsert({
      where: {
        // Gunakan unique constraint atau findFirst + create/update
        pregnancy_profile_id_reminder_type: {
          pregnancy_profile_id: profileId,
          reminder_type: 'anc_checkup',
        },
      },
      create: {
        pregnancy_profile_id: profileId,
        reminder_type: 'anc_checkup',
        cadence_days: cadenceDays,
        next_trigger_at: nextTrigger,
        status: 'active',
      },
      update: {
        cadence_days: cadenceDays,
        next_trigger_at: nextTrigger,
      },
    });
    ```

  > **Catatan:** Untuk upsert bekerja, perlu tambahkan `@@unique([pregnancy_profile_id, reminder_type])` di model Reminder di `schema.prisma`. Kalau tidak mau pakai unique constraint, gunakan pattern `findFirst` + `create` atau `update`.

- `updateCadenceOnNewAssessment(profileId, riskBadge)`:
  - Cari reminder ANC aktif untuk profil ini
  - Update `cadence_days` dan `next_trigger_at`
  - Ini dipanggil dari `RiskAssessmentsService.createFromCallback()`

- `createPostpartumReminder(profileId, dayNumber)`:
  - Hitung cadence berdasarkan day_number:
    - hari 1-3 → tiap hari (cadence = 1)
    - hari 4-14 → tiap 2-3 hari (cadence = 2)
    - hari 15-42 → tiap minggu (cadence = 7)
  - Set `next_trigger_at` accordingly

- `updatePostpartumCadence(profileId, dayNumber)`:
  - Re-calculate cadence saat postpartum log baru masuk

- `getDueReminders()`:
  - Query: `WHERE status = 'active' AND next_trigger_at <= NOW()`
  ```typescript
  return this.prisma.reminder.findMany({
    where: {
      status: 'active',
      next_trigger_at: { lte: new Date() },
    },
    include: {
      pregnancy_profile: {
        include: { user: true },
      },
    },
  });
  ```

- `markSent(reminderId)`:
  - Update `last_sent_at = now()`
  - Update `next_trigger_at = now() + cadence_days`
  ```typescript
  const reminder = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
  const nextTrigger = new Date();
  nextTrigger.setDate(nextTrigger.getDate() + reminder.cadence_days);

  await this.prisma.reminder.update({
    where: { id: reminderId },
    data: {
      last_sent_at: new Date(),
      next_trigger_at: nextTrigger,
    },
  });
  ```

- `pauseReminder(reminderId)`: status → paused
- `completeReminder(reminderId)`: status → done

### 3. File: `src/reminders/reminders.processor.ts`
- BullMQ Processor untuk queue `reminders`
- Cron job: jalankan setiap 1 jam (atau sesuai config)
  - `getDueReminders()`
  - Untuk setiap reminder due:
    - Trigger notifikasi (panggil NotificationsService, diimplementasi Task 12)
    - `markSent(reminderId)`

### 4. File: `src/reminders/reminders.controller.ts`
- `GET /reminders?pregnancy_profile_id=xxx` — role: owner, bidan, admin
  - List reminders untuk profil (paginated)
- `GET /reminders/:id` — role: owner, bidan, admin
- `PATCH /reminders/:id/pause` — role: bidan, admin
- `PATCH /reminders/:id/resume` — role: bidan, admin

### 5. File: `src/reminders/dto/` (DTO files)
- Query DTO, update DTO

### 6. Business Logic Cadence
```
// ANC Cadence (dari risk badge)
merah  → cadence_days = 3
kuning → cadence_days = 7
hijau  → cadence_days = 14

// Postpartum Cadence (dari day_number)
day 1-3   → cadence_days = 1
day 4-14  → cadence_days = 2
day 15-42 → cadence_days = 7
```

## Testing
- Test auto-create reminder saat risk assessment masuk
- Test cadence update: risk badge berubah dari hijau ke merah → cadence berubah dari 14 ke 3
- Test postpartum cadence berdasarkan day_number
- Test getDueReminders returns correct reminders
- Test markSent updates next_trigger_at correctly
- Test pause/resume reminder

## Postman Collection
Generate file: `postman/11-reminders.postman_collection.json`
- **Folder: Read**
  - `GET /reminders?pregnancy_profile_id=xxx`
  - `GET /reminders/:id`
- **Folder: Manage**
  - `PATCH /reminders/:id/pause`
  - `PATCH /reminders/:id/resume`
