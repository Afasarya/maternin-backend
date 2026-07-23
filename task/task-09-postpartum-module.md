# Task 09 — Postpartum Module + Internal Callback

## Tujuan
Implementasi postpartum logs (check-in harian masa nifas) yang mengirim data ke AI Service untuk evaluasi red flag, dan endpoint internal callback dari AI Service.

## Scope
- Create postpartum log endpoint
- Panggil AI Service `/api/v1/postpartum/evaluate`
- Internal callback endpoint `POST /internal/postpartum-flags`
- Read postpartum logs (histori)

## Detail Implementasi

### 1. File: `src/postpartum/postpartum.module.ts`
- Import: `PregnancyProfilesModule`, `AiServiceModule`
- Providers: `PostpartumService`
- Controllers: `PostpartumController`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/postpartum/postpartum.controller.ts`

#### Endpoint Publik
- `POST /postpartum-logs` — role: ibu_hamil, kader
  - Body:
    ```json
    {
      "pregnancy_profile_id": "uuid",
      "day_number": 3,
      "bleeding_level": "normal",
      "fever": false,
      "wound_condition": "baik",
      "headache_severe": false,
      "mood_flag": "baik"
    }
    ```
  - Flow:
    1. Validasi: pregnancy profile status harus `nifas`
    2. Simpan ke `postpartum_logs` via Prisma
    3. Ambil `had_preeclampsia_history` dari pregnancy profile
    4. Panggil AI Service `POST /api/v1/postpartum/evaluate`:
       ```json
       {
         "pregnancy_profile_id": "uuid",
         "postpartum_log": { ...data log },
         "had_preeclampsia_history": true/false
       }
       ```
    5. Kalau sukses: update `red_flag_triggered` di log berdasarkan response
    6. Kalau timeout: return status processing, queue retry
  - Return: postpartum log + evaluation result

- `GET /postpartum-logs?pregnancy_profile_id=xxx` — role: owner, bidan, admin
  - Pagination, sort by `day_number ASC` atau `created_at DESC`

- `GET /postpartum-logs/:id` — role: owner, bidan, admin

#### Endpoint Internal (dipanggil AI Service)
- `POST /internal/postpartum-flags`
  - Guard: `InternalAuthGuard`
  - Body:
    ```json
    {
      "pregnancy_profile_id": "uuid",
      "postpartum_log_id": "uuid",
      "red_flag_triggered": true,
      "reason": "Perdarahan banyak + sakit kepala hebat",
      "mental_health_flag": false
    }
    ```
  - Update `red_flag_triggered` di postpartum log terkait

### 3. File: `src/postpartum/postpartum.service.ts`
- Inject `PrismaService`, `AiServiceClient`
- `create(dto, userId)`:
  - Validasi profil status = nifas:
    ```typescript
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: dto.pregnancy_profile_id },
    });
    if (profile.status !== 'nifas') {
      throw new BadRequestException('Profil harus berstatus nifas');
    }
    ```
  - Simpan log via Prisma:
    ```typescript
    const log = await this.prisma.postpartumLog.create({
      data: {
        pregnancy_profile_id: dto.pregnancy_profile_id,
        day_number: dto.day_number,
        bleeding_level: dto.bleeding_level,
        fever: dto.fever,
        wound_condition: dto.wound_condition,
        headache_severe: dto.headache_severe,
        mood_flag: dto.mood_flag,
      },
    });
    ```
  - Panggil AI Service evaluate
  - Update red_flag_triggered berdasarkan response:
    ```typescript
    await this.prisma.postpartumLog.update({
      where: { id: log.id },
      data: { red_flag_triggered: aiResponse.red_flag_triggered },
    });
    ```
- `processPostpartumEvaluation(logId)`: retry job
- `updateFlags(logId, flags)`: update dari callback internal
  ```typescript
  await this.prisma.postpartumLog.update({
    where: { id: logId },
    data: { red_flag_triggered: flags.red_flag_triggered },
  });
  ```
- `findByProfile(profileId, pagination)`: list
  ```typescript
  return this.prisma.postpartumLog.findMany({
    where: { pregnancy_profile_id: profileId },
    orderBy: { day_number: 'asc' },
    skip: pagination.offset,
    take: pagination.limit,
  });
  ```
- `findOne(id)`: detail

### 4. File: `src/postpartum/dto/create-postpartum-log.dto.ts`
- `@IsUUID() pregnancy_profile_id`
- `@IsInt() @Min(1) @Max(42) day_number`
- `@IsEnum(BleedingLevel) bleeding_level`
- `@IsBoolean() fever`
- `@IsEnum(WoundCondition) wound_condition`
- `@IsBoolean() headache_severe`
- `@IsEnum(MoodFlag) mood_flag`

### 5. File: `src/postpartum/dto/postpartum-flag-callback.dto.ts`
- `@IsUUID() pregnancy_profile_id`
- `@IsUUID() postpartum_log_id`
- `@IsBoolean() red_flag_triggered`
- `@IsOptional() @IsString() reason`
- `@IsOptional() @IsBoolean() mental_health_flag`

## Testing
- Test create postpartum log → AI Service dipanggil → red_flag_triggered terupdate
- Test validasi: profil status bukan nifas → error
- Test internal callback → flag terupdate
- Test internal callback tanpa token → 401
- Test list postpartum logs paginated

## Postman Collection
Generate file: `postman/09-postpartum.postman_collection.json`
- **Folder: Create Log**
  - `POST /postpartum-logs` — normal check-in (semua baik)
  - `POST /postpartum-logs` — red flag scenario (bleeding banyak + headache)
  - `POST /postpartum-logs` — error: profil bukan nifas
- **Folder: Internal Callback**
  - `POST /internal/postpartum-flags` — sukses
  - `POST /internal/postpartum-flags` — tanpa token → 401
- **Folder: Read**
  - `GET /postpartum-logs?pregnancy_profile_id=xxx`
  - `GET /postpartum-logs/:id`
