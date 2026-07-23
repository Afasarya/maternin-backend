# Task 12 — Notifications Module (Fonnte WhatsApp + Logging)

## Tujuan
Implementasi sistem notifikasi yang mengirim pesan WhatsApp via Fonnte API untuk reminder terjadwal, dan logging semua notifikasi ke `notifications_log`.

## Scope
- Fonnte API client (kirim WA)
- BullMQ processor untuk kirim notifikasi
- Notification log (CRUD read)
- Retry logic (max 3x, exponential backoff)
- Channel: wa_patient, wa_bidan, wa_family, in_app

## Detail Implementasi

### 1. File: `src/notifications/notifications.module.ts`
- Import: `BullModule.registerQueue({ name: 'notifications' })`, `HttpModule`, `FamilyCircleModule`, `PregnancyProfilesModule`
- Providers: `NotificationsService`, `NotificationsProcessor`, `FonnteClient`
- Controllers: `NotificationsController`
- Export: `NotificationsService`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/notifications/fonnte.client.ts`
- Wrapper untuk Fonnte API
- Method: `sendWhatsApp(phoneNumber, message)`:
  - `POST https://api.fonnte.com/send`
  - Headers: `Authorization: {FONNTE_API_KEY}`
  - Body: `{ target: phoneNumber, message: message }`
  - Timeout: 10 detik
  - Return: success/failure

### 3. File: `src/notifications/notifications.service.ts`
- Inject `PrismaService`, `FonnteClient`, `FamilyCircleService`
- `sendReminderNotification(reminder)`:
  - Load pregnancy profile + user + family circle via Prisma:
    ```typescript
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: reminder.pregnancy_profile_id },
      include: {
        user: true,
        family_circles: true,
      },
    });
    ```
  - Build pesan reminder berdasarkan tipe:
    - ANC: "Halo {nama}, waktunya pemeriksaan kehamilan rutin. Jadwal berikutnya: {tanggal}."
    - Postpartum: "Halo {nama}, waktunya check-in nifas hari ke-{day}."
  - Kirim ke pasien (wa_patient)
  - Kirim ke bidan wilayah (wa_bidan) kalau risk merah/kuning
  - Kirim ke family circle sesuai `notify_on` preference
  - Log semua pengiriman ke `notifications_log`

- `sendNotification(channel, profileId, phoneNumber, message)`:
  - Try panggil FonnteClient
  - Kalau sukses: log `status: sent`, set `sent_at`
  - Kalau gagal: log `status: failed`
  - Return result

- `logNotification(profileId, channel, message, status, sentAt?)`:
  - Insert ke `notifications_log` via Prisma:
    ```typescript
    await this.prisma.notificationLog.create({
      data: {
        pregnancy_profile_id: profileId,
        channel: channel,
        message: message,
        status: status,
        sent_at: sentAt,
      },
    });
    ```

- `getNotificationHistory(profileId, pagination)`:
  - List notifications paginated:
    ```typescript
    return this.prisma.notificationLog.findMany({
      where: { pregnancy_profile_id: profileId },
      orderBy: { created_at: 'desc' },
      skip: pagination.offset,
      take: pagination.limit,
    });
    ```

### 4. File: `src/notifications/notifications.processor.ts`
- BullMQ Processor queue `notifications`
- Process job:
  - Panggil `FonnteClient.sendWhatsApp()`
  - Retry: max 3x, exponential backoff (1s, 4s, 9s)
  - Kalau semua retry gagal: update log `status: failed`
  - PENTING: gagal kirim WA TIDAK boleh bikin proses lain gagal

### 5. File: `src/notifications/notifications.controller.ts`
- `GET /notifications?pregnancy_profile_id=xxx` — role: owner, bidan, admin
  - List notification history paginated
  - Filter opsional: `channel`, `status`
- `GET /notifications/:id` — role: owner, bidan, admin

### 6. File: `src/notifications/dto/`
- Query DTO (pregnancy_profile_id, channel filter, status filter, pagination)

### 7. Template Pesan
```typescript
const TEMPLATES = {
  anc_reminder: (name: string, date: string) =>
    `Halo ${name}, waktunya pemeriksaan kehamilan rutin Anda. Jadwal berikutnya: ${date}. Jaga kesehatan Anda dan calon buah hati. 🤰`,
  
  postpartum_reminder: (name: string, day: number) =>
    `Halo ${name}, waktunya check-in nifas hari ke-${day}. Silakan isi laporan kondisi harian Anda di aplikasi MaternIn. 💛`,
  
  bidan_alert: (patientName: string, riskBadge: string) =>
    `[MaternIn] Pasien ${patientName} memiliki status risiko ${riskBadge}. Mohon segera ditindaklanjuti.`,
  
  family_update: (patientName: string, riskBadge: string) =>
    `[MaternIn] Update kondisi ${patientName}: status risiko ${riskBadge}. Pastikan ia mendapat dukungan dan perhatian.`,
};
```

## Testing
- Test sendNotification → FonnteClient dipanggil → log tersimpan
- Test retry: mock Fonnte gagal 2x lalu sukses → log status sent
- Test retry: mock Fonnte gagal 3x → log status failed, proses lain tidak terganggu
- Test notification history paginated
- Test filter by channel dan status

## Postman Collection
Generate file: `postman/12-notifications.postman_collection.json`
- **Folder: History**
  - `GET /notifications?pregnancy_profile_id=xxx`
  - `GET /notifications?pregnancy_profile_id=xxx&channel=wa_patient`
  - `GET /notifications?pregnancy_profile_id=xxx&status=failed`
  - `GET /notifications/:id`
