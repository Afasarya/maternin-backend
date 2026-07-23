# Task 16 — Reports Module (MDSR Monthly Export)

## Tujuan
Implementasi endpoint export laporan bulanan MDSR (Maternal Death Surveillance and Response) untuk bidan.

## Scope
- `GET /reports/monthly` — generate laporan bulanan
- Aggregasi data per puskesmas per bulan
- Format response JSON (bisa di-render jadi PDF/Excel di frontend)

## Detail Implementasi

### 1. File: `src/reports/reports.module.ts`
- Import: `PregnancyProfilesModule`, `RiskAssessmentsModule`, `AncRecordsModule`, `PostpartumModule`, `UsersModule`
- Providers: `ReportsService`
- Controllers: `ReportsController`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/reports/reports.controller.ts`
- `GET /reports/monthly` — role: bidan, admin
  - Query params:
    - `month` (1-12, default: bulan ini)
    - `year` (default: tahun ini)
    - `puskesmas_id` (opsional, default: puskesmas bidan yang login)
  - Response:
    ```json
    {
      "report_period": {
        "month": 7,
        "year": 2026,
        "puskesmas_name": "Puskesmas Tembalang"
      },
      "summary": {
        "total_pregnant": 42,
        "total_nifas": 8,
        "total_selesai": 3,
        "new_registrations": 5,
        "total_anc_visits": 120,
        "total_symptom_checkins": 85
      },
      "risk_distribution": {
        "merah": { "count": 3, "patients": ["Siti", "Ani", "Rina"] },
        "kuning": { "count": 12, "patients": ["..."] },
        "hijau": { "count": 27, "patients": ["..."] }
      },
      "high_risk_details": [
        {
          "patient_name": "Siti",
          "risk_factors": ["Hipertensi", "Riwayat preeklamsia"],
          "last_checkin": "2026-07-18",
          "gestational_week": 32
        }
      ],
      "postpartum_summary": {
        "total_nifas_active": 8,
        "red_flags_triggered": 2,
        "mental_health_flags": 1
      },
      "notification_summary": {
        "total_sent": 150,
        "total_failed": 3,
        "channels": {
          "wa_patient": 80,
          "wa_bidan": 40,
          "wa_family": 25,
          "in_app": 5
        }
      },
      "generated_at": "2026-07-22T14:00:00Z"
    }
    ```

### 3. File: `src/reports/reports.service.ts`
- Inject `PrismaService`
- `generateMonthlyReport(month, year, puskesmasId)`:
  - Hitung date range:
    ```typescript
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    ```
  - Query pregnancy profiles untuk puskesmas di bulan tersebut via Prisma:
    ```typescript
    const profiles = await this.prisma.pregnancyProfile.findMany({
      where: {
        user: { puskesmas_id: puskesmasId },
        created_at: { lte: endDate },
      },
      include: { user: { select: { full_name: true } } },
    });
    ```
  - Aggregate ANC records count:
    ```typescript
    const ancCount = await this.prisma.ancRecord.count({
      where: {
        pregnancy_profile: { user: { puskesmas_id: puskesmasId } },
        created_at: { gte: startDate, lte: endDate },
      },
    });
    ```
  - Aggregate symptom checkins count (similar pattern)
  - Get risk distribution (latest risk per patient) — bisa pakai raw query atau post-process:
    ```typescript
    // Opsi: pakai Prisma $queryRaw untuk complex aggregation
    const riskDistribution = await this.prisma.$queryRaw`
      SELECT ra.risk_badge, COUNT(DISTINCT ra.pregnancy_profile_id) as count
      FROM risk_assessments ra
      INNER JOIN (
        SELECT pregnancy_profile_id, MAX(created_at) as max_created
        FROM risk_assessments
        GROUP BY pregnancy_profile_id
      ) latest ON ra.pregnancy_profile_id = latest.pregnancy_profile_id 
        AND ra.created_at = latest.max_created
      INNER JOIN pregnancy_profiles pp ON ra.pregnancy_profile_id = pp.id
      INNER JOIN users u ON pp.user_id = u.id
      WHERE u.puskesmas_id = ${puskesmasId}::uuid
      GROUP BY ra.risk_badge
    `;
    ```
  - Get high risk patient details
  - Get postpartum summary:
    ```typescript
    const redFlags = await this.prisma.postpartumLog.count({
      where: {
        pregnancy_profile: { user: { puskesmas_id: puskesmasId } },
        red_flag_triggered: true,
        created_at: { gte: startDate, lte: endDate },
      },
    });
    ```
  - Get notification summary via groupBy:
    ```typescript
    const notifSummary = await this.prisma.notificationLog.groupBy({
      by: ['channel', 'status'],
      where: {
        pregnancy_profile: { user: { puskesmas_id: puskesmasId } },
        created_at: { gte: startDate, lte: endDate },
      },
      _count: true,
    });
    ```
  - Return compiled report

### 4. File: `src/reports/dto/report-query.dto.ts`
- `@IsOptional() @IsInt() @Min(1) @Max(12) month`
- `@IsOptional() @IsInt() @Min(2020) year`
- `@IsOptional() @IsUUID() puskesmas_id`

## Testing
- Test generate report → semua section terisi
- Test filter by month/year → data sesuai
- Test bidan hanya lihat report wilayahnya
- Test admin bisa lihat report semua puskesmas
- Test bulan tanpa data → report kosong tapi valid

## Postman Collection
Generate file: `postman/16-reports.postman_collection.json`
- **Folder: Monthly Report**
  - `GET /reports/monthly` — bulan ini (default)
  - `GET /reports/monthly?month=6&year=2026` — bulan spesifik
  - `GET /reports/monthly?puskesmas_id=xxx` — puskesmas spesifik (admin)
- **Folder: Access Control**
  - `GET /reports/monthly` — dengan token ibu_hamil → 403
  - `GET /reports/monthly` — dengan token kader → 403
