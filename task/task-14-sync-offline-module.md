# Task 14 — Sync Offline Module (Kader Batch Sync)

## Tujuan
Implementasi endpoint batch sync untuk kader yang bekerja offline di lapangan. Kader mengumpulkan data di device lalu sync sekaligus saat ada koneksi internet.

## Scope
- `POST /sync/batch` endpoint
- Idempotency via `client_uuid` (unique index)
- Last-write-wins conflict resolution berdasarkan `client_created_at`
- Process setiap record: insert ke tabel terkait + trigger AI Service pipeline
- Sync queue management

## Detail Implementasi

### 1. File: `src/sync/sync.module.ts`
- Import: `AncRecordsModule`, `SymptomCheckinsModule`, `BullModule.registerQueue({ name: 'sync-processing' })`
- Providers: `SyncService`, `SyncProcessor`
- Controllers: `SyncController`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/sync/sync.controller.ts`
- `POST /sync/batch` — role: kader
  - Body:
    ```json
    {
      "device_uuid": "device-abc-123",
      "records": [
        {
          "client_uuid": "uuid-generated-di-hp",
          "payload_type": "anc_record",
          "payload": {
            "pregnancy_profile_id": "uuid",
            "systolic": 120,
            "diastolic": 80,
            "weight_kg": 62,
            "recorded_at": "2026-07-20T09:00:00Z"
          },
          "client_created_at": "2026-07-20T09:00:00Z"
        },
        {
          "client_uuid": "uuid-generated-di-hp-2",
          "payload_type": "symptom_checkin",
          "payload": {
            "pregnancy_profile_id": "uuid",
            "checkin_type": "pregnancy",
            "answers": { "bengkak_kaki": true }
          },
          "client_created_at": "2026-07-20T09:30:00Z"
        }
      ]
    }
    ```
  - Response:
    ```json
    {
      "total_received": 2,
      "processed": 1,
      "skipped": 1,
      "failed": 0,
      "results": [
        { "client_uuid": "...", "status": "processed", "server_id": "uuid" },
        { "client_uuid": "...", "status": "skipped", "reason": "duplicate" }
      ]
    }
    ```

- `GET /sync/status?device_uuid=xxx` — role: kader
  - Return status sync terakhir untuk device ini

### 3. File: `src/sync/sync.service.ts`
- Inject `PrismaService`, `AncRecordsService`, `SymptomCheckinsService`
- `processBatch(dto, kaderUserId)`:
  - Loop setiap record:
    1. Cek `client_uuid` di `sync_queue` → kalau sudah ada, skip (idempotent):
       ```typescript
       const existing = await this.prisma.syncQueue.findUnique({
         where: { client_uuid: record.client_uuid },
       });
       if (existing) {
         results.push({ client_uuid: record.client_uuid, status: 'skipped', reason: 'duplicate' });
         continue;
       }
       ```
    2. Cek conflict: kalau `client_uuid` sama dan `client_created_at` lebih baru → update (last-write-wins)
    3. Insert ke `sync_queue` dengan status `pending`:
       ```typescript
       await this.prisma.syncQueue.create({
         data: {
           device_uuid: dto.device_uuid,
           payload_type: record.payload_type,
           payload: record.payload,
           client_created_at: new Date(record.client_created_at),
           client_uuid: record.client_uuid,
           status: 'pending',
         },
       });
       ```
    4. Berdasarkan `payload_type`:
       - `anc_record`: panggil `AncRecordsService.create()` dengan source = 'kader_offline'
       - `symptom_checkin`: panggil `SymptomCheckinsService.create()` dengan source = 'kader_offline' → ini juga trigger AI Service pipeline
    5. Update sync_queue status → `processed` (atau `failed` kalau error):
       ```typescript
       await this.prisma.syncQueue.update({
         where: { client_uuid: record.client_uuid },
         data: { status: 'processed', synced_at: new Date() },
       });
       ```
    6. Set `synced_at = now()`
  - Return summary

- `getDeviceStatus(deviceUuid)`:
  - Count total, processed, pending, failed untuk device ini:
    ```typescript
    const counts = await this.prisma.syncQueue.groupBy({
      by: ['status'],
      where: { device_uuid: deviceUuid },
      _count: true,
    });
    ```

### 4. File: `src/sync/sync.processor.ts`
- BullMQ processor untuk queue `sync-processing`
- Untuk kasus retry: process record yang gagal di batch sebelumnya

### 5. File: `src/sync/dto/sync-batch.dto.ts`
- `@IsString() device_uuid`
- `@IsArray() @ValidateNested({ each: true }) records`
- Nested: `SyncRecordDto`:
  - `@IsUUID() client_uuid`
  - `@IsEnum(SyncPayloadType) payload_type`
  - `@IsObject() payload`
  - `@IsDateString() client_created_at`

### 6. File: `src/sync/dto/sync-status-query.dto.ts`
- `@IsString() device_uuid`

## Testing
- Test batch sync 3 records → 3 processed
- Test idempotency: kirim batch yang sama 2x → second time all skipped
- Test mixed batch: 1 ANC + 1 symptom checkin → both processed correctly
- Test payload_type anc_record → ANC record tersimpan + source = kader_offline
- Test payload_type symptom_checkin → symptom checkin tersimpan + AI Service triggered
- Test device status endpoint
- Test access control: hanya kader yang bisa sync

## Postman Collection
Generate file: `postman/14-sync-offline.postman_collection.json`
- **Folder: Batch Sync**
  - `POST /sync/batch` — 2 ANC records
  - `POST /sync/batch` — 1 ANC + 1 symptom checkin
  - `POST /sync/batch` — duplicate test (kirim ulang)
  - `POST /sync/batch` — empty records array
- **Folder: Status**
  - `GET /sync/status?device_uuid=device-abc-123`
- **Folder: Access Control**
  - `POST /sync/batch` — dengan token ibu_hamil → 403
