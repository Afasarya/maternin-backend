# Task 13 — Bidan Dashboard Endpoints

## Tujuan
Implementasi endpoint khusus bidan untuk monitoring pasien: list pasien terurut risk badge, visit brief dari AI Service, dan akses ke data klinis pasien di wilayahnya.

## Scope
- `GET /bidan/patients` — list pasien wilayah bidan, sorted by risk_badge
- `GET /bidan/patients/:id/visit-brief` — panggil AI Service untuk ringkasan kunjungan
- Caching Redis untuk list pasien
- Hanya bidan dan admin yang bisa akses

## Detail Implementasi

### 1. Buat di dalam module yang sudah ada atau buat module baru
- Opsi: tambahkan controller `BidanController` di `PregnancyProfilesModule` atau buat module `bidan` sendiri
- Rekomendasi: buat `src/bidan/bidan.module.ts` terpisah agar bersih

### 2. File: `src/bidan/bidan.module.ts`
- Import: `PregnancyProfilesModule`, `RiskAssessmentsModule`, `AncRecordsModule`, `AiServiceModule`, `UsersModule`
- Controllers: `BidanController`
- Providers: `BidanService`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 3. File: `src/bidan/bidan.controller.ts`
- `GET /bidan/patients` — role: bidan, admin
  - Query params: `limit` (default 20), `offset`, `risk_badge` (filter opsional), `search` (nama pasien)
  - Logic:
    1. Ambil `puskesmas_id` dari `req.user`
    2. Query pregnancy profiles WHERE users.puskesmas_id = puskesmas_id
    3. Join latest risk_assessment untuk setiap profil
    4. Sort: merah dulu, lalu kuning, lalu hijau (risiko tertinggi di atas)
    5. Cek cache `bidan:patients:{puskesmas_id}` (TTL 5 menit)
  - Response:
    ```json
    {
      "data": [
        {
          "pregnancy_profile_id": "uuid",
          "patient_name": "...",
          "phone_number": "...",
          "hpl": "2026-10-15",
          "gestational_week": 28,
          "latest_risk_badge": "merah",
          "latest_aggregate_score": 84,
          "last_checkin_date": "2026-07-18",
          "risk_factors": ["..."]
        }
      ],
      "total": 42,
      "limit": 20,
      "offset": 0
    }
    ```

- `GET /bidan/patients/:id/visit-brief` — role: bidan, admin
  - Param: `:id` = pregnancy_profile_id
  - Logic:
    1. Validasi profil ada di wilayah bidan
    2. Kumpulkan data: latest ANC, latest risk assessment, recent symptom checkins, recent postpartum logs
    3. Panggil AI Service `POST /api/v1/visit-brief` (atau format data lokal kalau AI belum siap)
    4. Return ringkasan kunjungan
  - Response:
    ```json
    {
      "patient_name": "...",
      "gestational_week": 28,
      "latest_risk_badge": "kuning",
      "vitals_summary": "TD 130/85, BB 65kg",
      "risk_factors": ["Tekanan darah tinggi"],
      "recent_symptoms": ["..."],
      "recommendation": "...",
      "last_visit_date": "2026-07-15"
    }
    ```

- `GET /bidan/statistics` — role: bidan, admin
  - Return statistik wilayah:
    ```json
    {
      "total_patients": 42,
      "risk_distribution": { "merah": 3, "kuning": 12, "hijau": 27 },
      "overdue_checkins": 5,
      "nifas_count": 8
    }
    ```

### 4. File: `src/bidan/bidan.service.ts`
- Inject `PrismaService`
- `getPatients(puskesmasId, filters, pagination)`:
  - Query via Prisma dengan relasi:
    ```typescript
    const patients = await this.prisma.pregnancyProfile.findMany({
      where: {
        user: { puskesmas_id: puskesmasId },
        status: 'hamil',
        ...(filters.search && {
          user: {
            puskesmas_id: puskesmasId,
            full_name: { contains: filters.search, mode: 'insensitive' },
          },
        }),
      },
      include: {
        user: { select: { full_name: true, phone_number: true } },
        risk_assessments: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
        symptom_checkins: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { created_at: true },
        },
      },
      skip: pagination.offset,
      take: pagination.limit,
    });
    ```
  - Sort hasil berdasarkan risk badge (merah > kuning > hijau) — bisa post-process di application layer atau pakai raw query
- `getVisitBrief(profileId, puskesmasId)`: kumpulkan data + panggil AI
- `getStatistics(puskesmasId)`: aggregate queries via Prisma:
  ```typescript
  const [totalPatients, riskDistribution, nifasCount] = await Promise.all([
    this.prisma.pregnancyProfile.count({
      where: { user: { puskesmas_id: puskesmasId }, status: 'hamil' },
    }),
    this.prisma.riskAssessment.groupBy({
      by: ['risk_badge'],
      _count: true,
      where: {
        pregnancy_profile: { user: { puskesmas_id: puskesmasId } },
      },
    }),
    this.prisma.pregnancyProfile.count({
      where: { user: { puskesmas_id: puskesmasId }, status: 'nifas' },
    }),
  ]);
  ```
- `calculateGestationalWeek(hpht)`: helper function

### 5. File: `src/bidan/dto/`
- `query-patients.dto.ts`: limit, offset, risk_badge filter, search
- Minimal DTO, mostly query params

### 6. Gestational Week Calculation
```typescript
calculateGestationalWeek(hpht: Date): number {
  const diffMs = Date.now() - hpht.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}
```

## Testing
- Test GET /bidan/patients → sorted by risk badge (merah first)
- Test GET /bidan/patients — bidan hanya lihat pasien wilayahnya
- Test GET /bidan/patients — pagination correct
- Test GET /bidan/patients — cache hit (second request faster)
- Test GET /bidan/patients/:id/visit-brief → data terkumpul
- Test GET /bidan/statistics → aggregasi benar
- Test akses dengan token ibu_hamil → 403

## Postman Collection
Generate file: `postman/13-bidan-dashboard.postman_collection.json`
- **Folder: Patients**
  - `GET /bidan/patients` (default, sorted by risk)
  - `GET /bidan/patients?risk_badge=merah` (filter merah)
  - `GET /bidan/patients?search=Siti` (search by name)
  - `GET /bidan/patients?limit=5&offset=0` (pagination)
- **Folder: Visit Brief**
  - `GET /bidan/patients/:id/visit-brief`
- **Folder: Statistics**
  - `GET /bidan/statistics`
- **Folder: Access Control**
  - `GET /bidan/patients` — dengan token ibu_hamil → 403
