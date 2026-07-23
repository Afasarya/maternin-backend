# Task 04 — Users Module & Puskesmas Module (CRUD Dasar)

## Tujuan
Implementasi Users module (profile management) dan Puskesmas/Facilities module (CRUD puskesmas + proxy Nominatim).

## Scope
- Users module: get profile, update profile
- Puskesmas module: CRUD puskesmas (admin only), list puskesmas
- Facilities module: proxy ke Nominatim untuk cari faskes terdekat
- Caching Redis untuk facilities nearby

## Detail Implementasi

### 1. Users Module

#### File: `src/users/users.controller.ts`
- `GET /users/me` — role: semua authenticated user → return profil sendiri
- `PATCH /users/me` — role: semua authenticated user → update profil (full_name, email)
- `GET /users/:id` — role: admin, bidan (terbatas wilayah) → get user detail

#### File: `src/users/users.service.ts` (extend dari Task 03)
- Inject `PrismaService`
- `getProfile(userId)`: return user tanpa password_hash
  ```typescript
  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, role: true, full_name: true,
        phone_number: true, email: true, puskesmas_id: true,
        created_at: true, updated_at: true,
        // password_hash: false (default excluded by select)
      },
    });
  }
  ```
- `updateProfile(userId, dto)`: update allowed fields
  ```typescript
  async updateProfile(userId: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
  }
  ```
- `findById(id)`: return user

#### File: `src/users/dto/update-user.dto.ts`
- `@IsOptional() @IsString() full_name`
- `@IsOptional() @IsEmail() email`

### 2. Puskesmas / Facilities Module

#### File: `src/facilities/facilities.module.ts`
- Import: `HttpModule`
- Providers: `FacilitiesService`
- Controllers: `FacilitiesController`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`, cukup inject `PrismaService` di service

#### File: `src/facilities/facilities.controller.ts`
- `POST /facilities/puskesmas` — role: admin → create puskesmas
- `GET /facilities/puskesmas` — role: semua auth → list semua puskesmas (paginated)
- `GET /facilities/puskesmas/:id` — role: semua auth → get detail
- `PATCH /facilities/puskesmas/:id` — role: admin → update
- `DELETE /facilities/puskesmas/:id` — role: admin → delete
- `GET /facilities/nearby` — role: ibu_hamil → proxy ke Nominatim (cari klinik/hospital/puskesmas terdekat)

#### File: `src/facilities/facilities.service.ts`
- Inject `PrismaService`
- CRUD puskesmas standar via Prisma:
  ```typescript
  async create(dto: CreatePuskesmasDto) {
    return this.prisma.puskesmas.create({ data: dto });
  }

  async findAll(pagination) {
    const [data, total] = await Promise.all([
      this.prisma.puskesmas.findMany({
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.puskesmas.count(),
    ]);
    return { data, total };
  }
  ```
- `findNearby(lat, lng, radius)`:
  - Cek cache Redis key `facilities:nearby:{lat}:{lng}:{radius}` (TTL 24 jam)
  - Kalau miss, panggil Nominatim: `GET {NOMINATIM_BASE_URL}/search?q=puskesmas+OR+rumah+sakit&format=json&lat={lat}&lon={lng}&bounded=1&viewbox=...`
  - Simpan ke cache, return

#### File: `src/facilities/dto/create-puskesmas.dto.ts`
- `@IsString() name`, `@IsNumber() latitude`, `@IsNumber() longitude`, `@IsString() wilayah_kerja`

#### File: `src/facilities/dto/query-nearby.dto.ts`
- `@IsNumber() lat`, `@IsNumber() lng`, `@IsOptional() @IsNumber() radius` (default 5000 meter)

### 3. Redis Cache Setup
- Gunakan `ioredis` atau `@nestjs/cache-manager` dengan Redis store
- Setup di `app.module.ts` atau buat `CacheModule` sendiri
- Inject `CACHE_MANAGER` di FacilitiesService

## Testing
- `npm run build` sukses
- Test GET /users/me → return profil
- Test PATCH /users/me → update berhasil
- Test CRUD puskesmas (admin only guard)
- Test GET /facilities/nearby → response valid (bisa mock Nominatim kalau offline)

## Postman Collection
Generate file: `postman/04-users-facilities.postman_collection.json`
- **Folder: Users**
  - `GET /users/me` (dengan token ibu)
  - `PATCH /users/me` (update nama)
  - `GET /users/:id` (dengan token admin)
- **Folder: Puskesmas**
  - `POST /facilities/puskesmas` (admin)
  - `GET /facilities/puskesmas` (list)
  - `GET /facilities/puskesmas/:id`
  - `PATCH /facilities/puskesmas/:id` (admin)
  - `DELETE /facilities/puskesmas/:id` (admin)
- **Folder: Nearby**
  - `GET /facilities/nearby?lat=-6.9&lng=110.4&radius=5000`
- Semua request pakai variable `{{base_url}}` dan `{{token_*}}`
