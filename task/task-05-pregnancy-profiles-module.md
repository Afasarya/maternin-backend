# Task 05 — Pregnancy Profiles Module

## Tujuan
Implementasi CRUD profil kehamilan termasuk auto-kalkulasi HPL, update status ke nifas/selesai, dan akses kontrol berdasarkan role.

## Scope
- CRUD pregnancy profile
- Auto-compute HPL = HPHT + 280 hari
- Update status (hamil → nifas → selesai)
- Role-based access: ibu_hamil buat miliknya, bidan/kader create untuk pasien

## Detail Implementasi

### 1. File: `src/pregnancy-profiles/pregnancy-profiles.module.ts`
- Import: `UsersModule`
- Providers: `PregnancyProfilesService`
- Controllers: `PregnancyProfilesController`
- Export: `PregnancyProfilesService` (akan dipakai module lain)
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`, cukup inject `PrismaService`

### 2. File: `src/pregnancy-profiles/pregnancy-profiles.controller.ts`
- `POST /pregnancy-profiles` — role: ibu_hamil, bidan, kader
  - ibu_hamil: buat profil untuk diri sendiri (user_id = req.user.id)
  - bidan/kader: bisa buat profil untuk user lain (kirim user_id di body)
- `GET /pregnancy-profiles` — role: ibu_hamil (miliknya), bidan (wilayahnya), admin (semua)
  - Pagination: `limit` & `offset` (default limit 20)
  - Filter: `status` (opsional)
- `GET /pregnancy-profiles/:id` — role: owner, bidan (wilayahnya), admin
- `PATCH /pregnancy-profiles/:id` — role: owner, bidan, admin → update field yang boleh diubah
- `PATCH /pregnancy-profiles/:id/status` — role: bidan, kader
  - Body: `{ status: 'nifas' | 'selesai' }`
  - Kalau status jadi `nifas`, set `nifas_start_date = now()`

### 3. File: `src/pregnancy-profiles/pregnancy-profiles.service.ts`
- Inject `PrismaService`
- `create(dto, creatorId, creatorRole)`:
  - Hitung HPL: `hpl = hpht + 280 hari`
  - Kalau ibu_hamil: user_id = creatorId
  - Insert ke DB via Prisma:
    ```typescript
    const hpl = new Date(dto.hpht);
    hpl.setDate(hpl.getDate() + 280);

    return this.prisma.pregnancyProfile.create({
      data: {
        user_id: userId,
        hpht: new Date(dto.hpht),
        hpl,
        gravida: dto.gravida,
        existing_conditions: dto.existing_conditions ?? [],
        had_preeclampsia_history: dto.had_preeclampsia_history ?? false,
      },
    });
    ```
- `findAll(userId, role, puskesmasId, filters)`:
  - ibu_hamil: filter `user_id = userId`
  - bidan: join users, filter `users.puskesmas_id = puskesmasId`
    ```typescript
    // Bidan: pasien di wilayahnya
    return this.prisma.pregnancyProfile.findMany({
      where: {
        user: { puskesmas_id: puskesmasId },
        ...(filters.status && { status: filters.status }),
      },
      include: { user: { select: { full_name: true, phone_number: true } } },
      skip: pagination.offset,
      take: pagination.limit,
    });
    ```
  - admin: all
  - Pagination
- `findOne(id)`: return profil + relasi user
- `update(id, dto)`: partial update via `prisma.pregnancyProfile.update()`
- `updateStatus(id, newStatus)`:
  - Validasi transisi: hamil → nifas → selesai (tidak boleh loncat/mundur)
  - Set `nifas_start_date` kalau status = nifas:
    ```typescript
    await this.prisma.pregnancyProfile.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === 'nifas' && { nifas_start_date: new Date() }),
      },
    });
    ```

### 4. File: `src/pregnancy-profiles/dto/create-pregnancy-profile.dto.ts`
- `@IsOptional() @IsUUID() user_id` (wajib kalau bidan/kader)
- `@IsDateString() hpht`
- `@IsInt() @Min(1) gravida`
- `@IsOptional() @IsArray() existing_conditions` (jsonb)
- `@IsOptional() @IsBoolean() had_preeclampsia_history`

### 5. File: `src/pregnancy-profiles/dto/update-pregnancy-profile.dto.ts`
- PartialType dari create, tanpa user_id

### 6. File: `src/pregnancy-profiles/dto/update-status.dto.ts`
- `@IsEnum(PregnancyStatus) status` — hanya `nifas` atau `selesai`

### 7. Ownership Guard Logic
- Buat helper/method: `isOwner(profileId, userId)` → cek profile.user_id == userId
  ```typescript
  async isOwner(profileId: string, userId: string): Promise<boolean> {
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: profileId },
      select: { user_id: true },
    });
    return profile?.user_id === userId;
  }
  ```
- Dipakai di controller sebelum return data

## Testing
- Test create profil (ibu_hamil buat sendiri)
- Test create profil (bidan buat untuk pasien)
- Test HPL auto-computed (HPHT + 280 hari)
- Test get profil — ibu_hamil hanya lihat miliknya
- Test get profil — bidan lihat wilayahnya
- Test update status hamil → nifas (nifas_start_date terisi)
- Test update status nifas → selesai
- Test update status illegal (selesai → hamil) → error

## Postman Collection
Generate file: `postman/05-pregnancy-profiles.postman_collection.json`
- **Folder: Create**
  - `POST /pregnancy-profiles` (ibu_hamil buat sendiri)
  - `POST /pregnancy-profiles` (bidan buat untuk pasien, kirim user_id)
- **Folder: Read**
  - `GET /pregnancy-profiles` (ibu_hamil — list miliknya)
  - `GET /pregnancy-profiles` (bidan — list wilayahnya)
  - `GET /pregnancy-profiles/:id`
- **Folder: Update**
  - `PATCH /pregnancy-profiles/:id` (update existing_conditions)
  - `PATCH /pregnancy-profiles/:id/status` (status → nifas)
  - `PATCH /pregnancy-profiles/:id/status` (status → selesai)
  - `PATCH /pregnancy-profiles/:id/status` (error: invalid transition)
