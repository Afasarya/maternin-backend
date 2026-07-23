# Task 10 — Family Circle Module

## Tujuan
Implementasi CRUD kontak keluarga (family circle) yang akan menerima notifikasi tentang kondisi ibu hamil.

## Scope
- CRUD kontak keluarga
- Hanya ibu_hamil yang bisa manage family circle-nya sendiri
- Admin bisa lihat semua

## Detail Implementasi

### 1. File: `src/family-circle/family-circle.module.ts`
- Import: `PregnancyProfilesModule`
- Providers: `FamilyCircleService`
- Controllers: `FamilyCircleController`
- Export: `FamilyCircleService` (dipakai notifications module)
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/family-circle/family-circle.controller.ts`
- `POST /family-circle` — role: ibu_hamil
  - Validasi: pregnancy_profile harus milik req.user
  - Body:
    ```json
    {
      "pregnancy_profile_id": "uuid",
      "contact_name": "Suami",
      "contact_phone": "+628123456789",
      "relation": "suami",
      "notify_on": "semua_perubahan"
    }
    ```
- `GET /family-circle?pregnancy_profile_id=xxx` — role: owner, bidan, admin
  - List semua kontak keluarga untuk profil tsb
- `GET /family-circle/:id` — role: owner, admin
- `PATCH /family-circle/:id` — role: owner
  - Update contact_name, contact_phone, relation, notify_on
- `DELETE /family-circle/:id` — role: owner
  - Soft delete atau hard delete

### 3. File: `src/family-circle/family-circle.service.ts`
- Inject `PrismaService`
- `create(dto, userId)`: validasi ownership, insert via Prisma:
  ```typescript
  return this.prisma.familyCircle.create({
    data: {
      pregnancy_profile_id: dto.pregnancy_profile_id,
      contact_name: dto.contact_name,
      contact_phone: dto.contact_phone,
      relation: dto.relation,
      notify_on: dto.notify_on,
    },
  });
  ```
- `findByProfile(profileId)`: list kontak
  ```typescript
  return this.prisma.familyCircle.findMany({
    where: { pregnancy_profile_id: profileId },
  });
  ```
- `findOne(id)`: detail
- `update(id, dto, userId)`: validasi ownership, update
  ```typescript
  return this.prisma.familyCircle.update({
    where: { id },
    data: dto,
  });
  ```
- `remove(id, userId)`: validasi ownership, delete
  ```typescript
  return this.prisma.familyCircle.delete({
    where: { id },
  });
  ```
- `findContactsForNotification(profileId, riskBadge)`:
  - Kalau `risk_badge == merah`: return semua kontak
  - Kalau lain: return hanya yang `notify_on == 'semua_perubahan'`
  - (Dipakai oleh notifications module)
  ```typescript
  const where: any = { pregnancy_profile_id: profileId };
  if (riskBadge !== 'merah') {
    where.notify_on = 'semua_perubahan';
  }
  return this.prisma.familyCircle.findMany({ where });
  ```

### 4. File: `src/family-circle/dto/create-family-circle.dto.ts`
- `@IsUUID() pregnancy_profile_id`
- `@IsString() contact_name`
- `@IsString() contact_phone`
- `@IsString() relation`
- `@IsEnum(NotifyOn) notify_on`

### 5. File: `src/family-circle/dto/update-family-circle.dto.ts`
- PartialType dari create, tanpa pregnancy_profile_id

## Testing
- Test create kontak keluarga → sukses
- Test create untuk profil milik orang lain → 403
- Test list kontak per profil
- Test update kontak
- Test delete kontak
- Test findContactsForNotification logic (merah → semua, lainnya → semua_perubahan only)

## Postman Collection
Generate file: `postman/10-family-circle.postman_collection.json`
- **Folder: CRUD**
  - `POST /family-circle` — tambah kontak suami
  - `POST /family-circle` — tambah kontak ibu
  - `GET /family-circle?pregnancy_profile_id=xxx`
  - `GET /family-circle/:id`
  - `PATCH /family-circle/:id` — update nomor telp
  - `DELETE /family-circle/:id`
- **Folder: Access Control**
  - `POST /family-circle` — profil bukan miliknya → error
  - `GET /family-circle` — dengan token bidan → bisa lihat
