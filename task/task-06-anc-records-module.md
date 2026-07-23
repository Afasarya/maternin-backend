# Task 06 — ANC Records Module

## Tujuan
Implementasi CRUD catatan ANC (Antenatal Care) yang mencatat data pemeriksaan ibu hamil seperti tekanan darah, berat badan, tinggi fundus, dll.

## Scope
- Create ANC record (ibu_hamil self-input, nakes/bidan input, kader offline source)
- List ANC records per pregnancy profile (paginated, sorted by recorded_at)
- Get single ANC record
- Idempotency check via `client_uuid`

## Detail Implementasi

### 1. File: `src/anc-records/anc-records.module.ts`
- Import: `PregnancyProfilesModule`
- Providers: `AncRecordsService`
- Controllers: `AncRecordsController`
- Export: `AncRecordsService` (akan dipakai module symptom-checkins)
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/anc-records/anc-records.controller.ts`
- `POST /anc-records` — role: ibu_hamil, bidan, kader
  - Tentukan `source` berdasarkan role: ibu_hamil → 'self', bidan → 'nakes', kader → 'kader_offline'
  - `recorded_by_user_id` = req.user.id
  - Kalau ada `client_uuid`, cek idempotency (skip kalau sudah ada)
- `GET /anc-records?pregnancy_profile_id=xxx` — role: owner, bidan (wilayahnya), admin
  - Wajib query param `pregnancy_profile_id`
  - Pagination: `limit` & `offset`
  - Sort: `recorded_at DESC` (terbaru dulu)
- `GET /anc-records/:id` — role: owner, bidan (wilayahnya), admin
- `GET /anc-records/latest?pregnancy_profile_id=xxx` — role: semua auth
  - Return ANC record terakhir untuk profil tsb (dipakai oleh symptom-checkins saat panggil AI Service)

### 3. File: `src/anc-records/anc-records.service.ts`
- Inject `PrismaService`
- `create(dto, recordedByUserId, role)`:
  - Cek `client_uuid` kalau ada — kalau sudah exist di DB, return existing record (idempotent):
    ```typescript
    if (dto.client_uuid) {
      const existing = await this.prisma.ancRecord.findFirst({
        where: { client_uuid: dto.client_uuid },
      });
      if (existing) return existing;
    }
    ```
  - Tentukan source dari role
  - Insert ke DB:
    ```typescript
    return this.prisma.ancRecord.create({
      data: {
        pregnancy_profile_id: dto.pregnancy_profile_id,
        recorded_by_user_id: recordedByUserId,
        source: source,
        systolic: dto.systolic,
        diastolic: dto.diastolic,
        weight_kg: dto.weight_kg,
        fundal_height_cm: dto.fundal_height_cm,
        protein_urine: dto.protein_urine,
        platelet_count: dto.platelet_count,
        recorded_at: dto.recorded_at ?? new Date(),
        client_uuid: dto.client_uuid,
      },
    });
    ```
- `findByProfile(profileId, pagination)`: list ANC records paginated
  ```typescript
  return this.prisma.ancRecord.findMany({
    where: { pregnancy_profile_id: profileId },
    orderBy: { recorded_at: 'desc' },
    skip: pagination.offset,
    take: pagination.limit,
  });
  ```
- `findOne(id)`: return single record
- `findLatest(profileId)`: return ANC record terakhir (dipakai internal)
  ```typescript
  return this.prisma.ancRecord.findFirst({
    where: { pregnancy_profile_id: profileId },
    orderBy: { recorded_at: 'desc' },
  });
  ```

### 4. File: `src/anc-records/dto/create-anc-record.dto.ts`
- `@IsUUID() pregnancy_profile_id`
- `@IsOptional() @IsInt() systolic`
- `@IsOptional() @IsInt() diastolic`
- `@IsOptional() @IsNumber() weight_kg`
- `@IsOptional() @IsNumber() fundal_height_cm`
- `@IsOptional() @IsString() protein_urine`
- `@IsOptional() @IsNumber() platelet_count`
- `@IsOptional() @IsDateString() recorded_at` (default now)
- `@IsOptional() @IsUUID() client_uuid`

### 5. Access Control Logic
- ibu_hamil: hanya akses record yang `pregnancy_profile.user_id == req.user.id`
- bidan: akses record dari pasien di `puskesmas_id` yang sama
- kader: hanya write, tidak bisa read data klinis sensitif pasien lain
- admin: full access

## Testing
- Test create ANC record (ibu_hamil, source = self)
- Test create ANC record (bidan, source = nakes)
- Test idempotency: kirim dua kali dengan `client_uuid` yang sama → hanya 1 record
- Test list ANC records paginated
- Test get latest ANC record
- Test access control: ibu_hamil tidak bisa lihat record orang lain

## Postman Collection
Generate file: `postman/06-anc-records.postman_collection.json`
- **Folder: Create**
  - `POST /anc-records` — ibu_hamil input (systolic, diastolic, weight)
  - `POST /anc-records` — bidan input (lengkap semua field)
  - `POST /anc-records` — idempotency test (kirim 2x client_uuid sama)
- **Folder: Read**
  - `GET /anc-records?pregnancy_profile_id=xxx&limit=10&offset=0`
  - `GET /anc-records/:id`
  - `GET /anc-records/latest?pregnancy_profile_id=xxx`
- **Folder: Access Control**
  - `GET /anc-records?pregnancy_profile_id=xxx` — dengan token user lain → 403
