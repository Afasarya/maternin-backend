# Task 07 — Symptom Checkins Module + AI Service Integration

## Tujuan
Implementasi endpoint symptom check-in yang menerima input gejala dari ibu hamil/kader, memanggil AI Service untuk analisis triage, dan menangani response/timeout dengan benar.

## Scope
- Create symptom checkin endpoint
- Panggilan ke AI Service `/api/v1/triage/analyze` sesuai kontrak
- Timeout 5 detik + retry via background job
- Rate limiting di endpoint ini
- Idempotency via `client_uuid`
- AI Service client (shared HttpService wrapper)

## Detail Implementasi

### 1. File: `src/common/services/ai-service.client.ts`
- Wrapper HttpService untuk semua panggilan ke AI Service
- Base URL dari `AI_SERVICE_URL` config
- Default timeout: 5000ms
- Header wajib: `X-Internal-Token`, `X-Request-Id`
- Methods:
  - `analyzeTriageSymptoms(payload)`: POST `/api/v1/triage/analyze`
  - `evaluatePostpartum(payload)`: POST `/api/v1/postpartum/evaluate` (dipakai di task berikutnya)
  - `chat(payload)`: POST `/api/v1/chat` (dipakai di task berikutnya)
- Error handling: kalau timeout/error, throw custom exception `AiServiceUnavailableException`
- Buat module `AiServiceModule` yang export `AiServiceClient`

### 2. File: `src/symptom-checkins/symptom-checkins.module.ts`
- Import: `AncRecordsModule`, `PregnancyProfilesModule`, `AiServiceModule`, `RiskAssessmentsModule`
- Providers: `SymptomCheckinsService`
- Controllers: `SymptomCheckinsController`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 3. File: `src/symptom-checkins/symptom-checkins.controller.ts`
- `POST /symptom-checkins` — role: ibu_hamil, kader
  - **Rate limited**: `@Throttle({ default: { limit: 10, ttl: 60000 } })`
  - Body: symptom answers + optional conjunctiva image URL
  - Flow:
    1. Validasi input
    2. Cek `client_uuid` idempotency
    3. Simpan symptom checkin ke DB via Prisma
    4. Ambil latest ANC record untuk profil ini
    5. Ambil pregnancy profile (untuk `had_preeclampsia_history`)
    6. Panggil AI Service `/api/v1/triage/analyze`
    7. Kalau sukses: simpan hasil ke `risk_assessments` (via RiskAssessmentsService)
    8. Kalau timeout/error: return `{ status: 'processing', message: 'Sedang diproses' }` + queue retry job
  - Return: checkin data + risk assessment (kalau sukses) atau status processing

- `GET /symptom-checkins?pregnancy_profile_id=xxx` — role: owner, bidan, admin
  - Pagination, sort by created_at DESC

- `GET /symptom-checkins/:id` — role: owner, bidan, admin

### 4. File: `src/symptom-checkins/symptom-checkins.service.ts`
- Inject `PrismaService`, `AiServiceClient`, `AncRecordsService`, `RiskAssessmentsService`
- `create(dto, userId, role)`:
  - Cek idempotency `client_uuid`:
    ```typescript
    if (dto.client_uuid) {
      const existing = await this.prisma.symptomCheckin.findFirst({
        where: { client_uuid: dto.client_uuid },
      });
      if (existing) return existing;
    }
    ```
  - Tentukan source: ibu_hamil → 'self', kader → 'kader_offline'
  - Insert checkin ke DB:
    ```typescript
    const checkin = await this.prisma.symptomCheckin.create({
      data: {
        pregnancy_profile_id: dto.pregnancy_profile_id,
        checkin_type: dto.checkin_type,
        answers: dto.answers,
        conjunctiva_image_url: dto.conjunctiva_image_url,
        source: source,
        client_uuid: dto.client_uuid,
      },
    });
    ```
  - Panggil `processTriageAnalysis(checkinId)` (bisa async via BullMQ kalau perlu)
- `processTriageAnalysis(checkinId)`:
  - Load checkin + profile + latest ANC via Prisma
  - Build payload sesuai kontrak section 6:
    ```json
    {
      "pregnancy_profile_id": "uuid",
      "symptom_checkin_id": "uuid",
      "answers": { ... },
      "conjunctiva_image_url": "...",
      "latest_anc": { "systolic": ..., "diastolic": ..., "protein_urine": "..." },
      "has_preeclampsia_history": false
    }
    ```
  - Panggil AI Service
  - Simpan hasil ke risk_assessments
- `findByProfile(profileId, pagination)`: list
  ```typescript
  return this.prisma.symptomCheckin.findMany({
    where: { pregnancy_profile_id: profileId },
    orderBy: { created_at: 'desc' },
    skip: pagination.offset,
    take: pagination.limit,
  });
  ```
- `findOne(id)`: detail

### 5. File: `src/symptom-checkins/dto/create-symptom-checkin.dto.ts`
- `@IsUUID() pregnancy_profile_id`
- `@IsEnum(CheckinType) checkin_type`
- `@IsObject() answers` (jsonb)
- `@IsOptional() @IsString() conjunctiva_image_url`
- `@IsOptional() @IsUUID() client_uuid`

### 6. Retry Logic (Background Job)
- Kalau AI Service timeout/error saat panggil dari controller:
  - Return response ke client: `{ status: 'processing' }`
  - Queue BullMQ job `triage-retry` dengan data checkin
  - Job processor: retry panggil AI Service (max 3x, exponential backoff)
  - Kalau akhirnya sukses: simpan risk assessment
  - Kalau gagal total: log error, biarkan checkin tanpa risk assessment

## Testing
- Test create symptom checkin → AI Service dipanggil → risk assessment tersimpan
- Test idempotency: 2x submit client_uuid sama → 1 record
- Test timeout handling: mock AI Service lambat → response 'processing'
- Test list & get checkins
- Test rate limiting

## Postman Collection
Generate file: `postman/07-symptom-checkins.postman_collection.json`
- **Folder: Create**
  - `POST /symptom-checkins` — ibu_hamil, pregnancy type
  - `POST /symptom-checkins` — ibu_hamil, postpartum type
  - `POST /symptom-checkins` — with conjunctiva_image_url
  - `POST /symptom-checkins` — idempotency test
- **Folder: Read**
  - `GET /symptom-checkins?pregnancy_profile_id=xxx`
  - `GET /symptom-checkins/:id`
- **Folder: Error Handling**
  - `POST /symptom-checkins` — rate limit test (rapid fire)
