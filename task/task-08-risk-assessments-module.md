# Task 08 — Risk Assessments Module + Internal Callback Endpoints

## Tujuan
Implementasi module risk assessments: endpoint publik untuk baca histori risk assessment, DAN endpoint internal callback yang dipanggil AI Service untuk simpan hasil kalkulasi.

## Scope
- Endpoint internal `POST /internal/risk-assessments` (callback dari AI Service)
- Endpoint publik `GET /pregnancy-profiles/:id/risk-assessments` (histori)
- Validasi `X-Internal-Token` di endpoint internal
- Update reminder cadence setiap ada risk assessment baru
- Invalidasi cache Redis

## Detail Implementasi

### 1. File: `src/risk-assessments/risk-assessments.module.ts`
- Import: `PregnancyProfilesModule`, `RemindersModule` (forward ref kalau perlu)
- Providers: `RiskAssessmentsService`
- Controllers: `RiskAssessmentsController`
- Export: `RiskAssessmentsService`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/risk-assessments/risk-assessments.controller.ts`

#### Endpoint Internal (dipanggil AI Service)
- `POST /internal/risk-assessments`
  - Guard: `InternalAuthGuard` (cek `X-Internal-Token`)
  - Body sesuai response AI Service:
    ```json
    {
      "pregnancy_profile_id": "uuid",
      "symptom_checkin_id": "uuid (nullable)",
      "triage_score": 75,
      "anemia_probability": 0.3,
      "preeclampsia_probability": 0.8,
      "aggregate_score": 84,
      "risk_badge": "merah",
      "risk_factors": ["..."],
      "recommendation_text": "..."
    }
    ```
  - Side effects:
    1. Simpan ke tabel `risk_assessments` via Prisma
    2. Update reminder cadence (Task 11)
    3. Invalidasi cache `risk:latest:{profile_id}`
    4. Invalidasi cache `bidan:patients:{puskesmas_id}` (cari puskesmas_id lewat profile → user)

#### Endpoint Publik
- `GET /pregnancy-profiles/:id/risk-assessments` — role: owner (ibu_hamil), bidan
  - Pagination: `limit` & `offset`
  - Sort: `created_at DESC`
  - Return: list risk assessments

- `GET /risk-assessments/:id` — role: owner, bidan, admin
  - Return: single risk assessment detail

- `GET /risk-assessments/latest?pregnancy_profile_id=xxx` — role: owner, bidan
  - Cek cache `risk:latest:{profile_id}` (TTL 10 menit)
  - Kalau miss: query DB, set cache
  - Return: latest risk assessment

### 3. File: `src/risk-assessments/risk-assessments.service.ts`
- Inject `PrismaService`
- `createFromCallback(dto)`:
  - Insert ke DB via Prisma:
    ```typescript
    const assessment = await this.prisma.riskAssessment.create({
      data: {
        pregnancy_profile_id: dto.pregnancy_profile_id,
        symptom_checkin_id: dto.symptom_checkin_id,
        triage_score: dto.triage_score,
        anemia_probability: dto.anemia_probability,
        preeclampsia_probability: dto.preeclampsia_probability,
        aggregate_score: dto.aggregate_score,
        risk_badge: dto.risk_badge,
        risk_factors: dto.risk_factors,
        recommendation_text: dto.recommendation_text,
      },
    });
    ```
  - Invalidasi cache
  - Trigger update reminder cadence
- `createFromAiResponse(profileId, checkinId, aiResponse)`:
  - Map AI response ke Prisma create data
  - Insert ke DB
  - Same side effects as callback
- `findByProfile(profileId, pagination)`: list paginated
  ```typescript
  return this.prisma.riskAssessment.findMany({
    where: { pregnancy_profile_id: profileId },
    orderBy: { created_at: 'desc' },
    skip: pagination.offset,
    take: pagination.limit,
  });
  ```
- `findOne(id)`: detail
- `findLatest(profileId)`: cached query
  ```typescript
  return this.prisma.riskAssessment.findFirst({
    where: { pregnancy_profile_id: profileId },
    orderBy: { created_at: 'desc' },
  });
  ```

### 4. File: `src/risk-assessments/dto/create-risk-assessment-internal.dto.ts`
- Semua field sesuai tabel + validasi `class-validator`

### 5. Cache Invalidation
- Saat risk assessment baru masuk:
  - Delete `risk:latest:{pregnancy_profile_id}`
  - Cari `puskesmas_id` lewat Prisma: profile → user → puskesmas_id
    ```typescript
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: dto.pregnancy_profile_id },
      include: { user: { select: { puskesmas_id: true } } },
    });
    ```
  - Delete `bidan:patients:{puskesmas_id}`

## Testing
- Test POST /internal/risk-assessments → data tersimpan, cache invalidated
- Test POST /internal/risk-assessments tanpa X-Internal-Token → 401
- Test GET histori risk assessments → paginated, sorted
- Test GET latest → cached response
- Test cache invalidation: setelah POST internal, GET latest harus return data baru

## Postman Collection
Generate file: `postman/08-risk-assessments.postman_collection.json`
- **Folder: Internal Callback**
  - `POST /internal/risk-assessments` — sukses (dengan header X-Internal-Token)
  - `POST /internal/risk-assessments` — error tanpa token → 401
  - `POST /internal/risk-assessments` — risk badge merah
  - `POST /internal/risk-assessments` — risk badge hijau
- **Folder: Public Read**
  - `GET /pregnancy-profiles/:id/risk-assessments?limit=10&offset=0`
  - `GET /risk-assessments/:id`
  - `GET /risk-assessments/latest?pregnancy_profile_id=xxx`
