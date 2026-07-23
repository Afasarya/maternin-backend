# Task 03 — Auth Module (Register, Login, JWT, Guards)

## Tujuan
Implementasi lengkap authentication & authorization: register, login, JWT strategy, role-based guard, dan internal token guard.

## Scope
- Auth module: register & login endpoints
- JWT strategy & Passport integration
- Role-based access guard (`@Roles()` decorator + `RolesGuard`)
- Internal token guard (untuk endpoint `/internal/*`)
- Password hashing dengan bcrypt
- Rate limiting di `/auth/login`

## Detail Implementasi

### 1. File: `src/auth/auth.module.ts`
- Import: `JwtModule.registerAsync()` (JWT_SECRET dari ConfigService, expiresIn: '7d')
- Import: `PassportModule.register({ defaultStrategy: 'jwt' })`
- Import: `UsersModule`
- Providers: `AuthService`, `JwtStrategy`
- Controllers: `AuthController`
- **Catatan:** TIDAK perlu import `PrismaModule` karena sudah `@Global()` — cukup inject `PrismaService` di service

### 2. File: `src/auth/auth.controller.ts`
- `POST /auth/register` (public, no guard)
  - Body: `{ full_name, phone_number, password, role, email?, puskesmas_id? }`
  - Validasi: phone_number unik, role wajib, kalau role bidan/kader maka puskesmas_id wajib
  - Return: `{ user: { id, full_name, phone_number, role }, access_token }`
- `POST /auth/login` (public, no guard, **rate limited**)
  - Body: `{ phone_number, password }`
  - Validasi: cek user ada, password match
  - Return: `{ user: { id, full_name, phone_number, role }, access_token }`
  - Rate limit: `@Throttle({ default: { limit: 5, ttl: 60000 } })`

### 3. File: `src/auth/auth.service.ts`
- `register(dto)`: hash password, create user via `PrismaService`, generate JWT
- `login(dto)`: find by phone via `PrismaService`, compare password, generate JWT
- `generateToken(user)`: sign JWT dengan payload `{ sub: user.id, role: user.role, puskesmas_id: user.puskesmas_id }`

Contoh penggunaan Prisma:
```typescript
// Register
const user = await this.prisma.user.create({
  data: {
    full_name: dto.full_name,
    phone_number: dto.phone_number,
    password_hash: hashedPassword,
    role: dto.role,
    email: dto.email,
    puskesmas_id: dto.puskesmas_id,
  },
});

// Login - find by phone
const user = await this.prisma.user.findUnique({
  where: { phone_number: dto.phone_number },
});
```

### 4. File: `src/auth/strategies/jwt.strategy.ts`
- Extend `PassportStrategy(Strategy)`
- Extract JWT dari `Authorization: Bearer <token>`
- Validate: return `{ id: payload.sub, role: payload.role, puskesmas_id: payload.puskesmas_id }`

### 5. File: `src/auth/dto/register.dto.ts`
- Validasi: `@IsString() full_name`, `@IsPhoneNumber() phone_number`, `@IsString() @MinLength(8) password`, `@IsEnum(UserRole) role`, `@IsOptional() @IsEmail() email`, `@IsOptional() @IsUUID() puskesmas_id`
- Custom validation: kalau role == bidan || kader, puskesmas_id wajib

### 6. File: `src/auth/dto/login.dto.ts`
- Validasi: `@IsString() phone_number`, `@IsString() password`

### 7. File: `src/common/guards/jwt-auth.guard.ts`
- Extend `AuthGuard('jwt')`

### 8. File: `src/common/guards/roles.guard.ts`
- Implement `CanActivate`
- Baca metadata `roles` dari handler
- Cek `req.user.role` termasuk di roles yang diizinkan
- Kalau tidak match, throw `ForbiddenException`

### 9. File: `src/common/decorators/roles.decorator.ts`
- `@Roles('bidan', 'admin')` — set metadata

### 10. File: `src/common/decorators/current-user.decorator.ts`
- `@CurrentUser()` — extract `req.user` dari request

### 11. File: `src/common/guards/internal-auth.guard.ts`
- Cek header `X-Internal-Token` match dengan `INTERNAL_SERVICE_TOKEN` dari config
- Kalau tidak match, throw `UnauthorizedException`

### 12. File: `src/users/users.module.ts` & `src/users/users.service.ts`
- `UsersModule`: export `UsersService`
- `UsersService`: inject `PrismaService`, methods: `findByPhone(phone)`, `findById(id)`, `create(dto)` — basic CRUD untuk auth
- Contoh:
  ```typescript
  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone_number: phone } });
  }
  ```

## Testing
- `npm run build` sukses
- Test register dengan semua role
- Test login sukses & gagal (wrong password, user not found)
- Test akses endpoint protected tanpa token → 401
- Test akses endpoint dengan role salah → 403
- Test rate limiting di login (hit limit)

## Postman Collection
Generate file: `postman/03-auth.postman_collection.json`
- **Folder: Register**
  - `POST /auth/register` — register ibu_hamil
  - `POST /auth/register` — register bidan (dengan puskesmas_id)
  - `POST /auth/register` — register kader (dengan puskesmas_id)
  - `POST /auth/register` — register admin
  - `POST /auth/register` — error: phone sudah terdaftar
  - `POST /auth/register` — error: bidan tanpa puskesmas_id
- **Folder: Login**
  - `POST /auth/login` — sukses
  - `POST /auth/login` — error: wrong password
  - `POST /auth/login` — error: user not found
- Set variable `{{base_url}}`, `{{token_ibu}}`, `{{token_bidan}}`, `{{token_kader}}`, `{{token_admin}}`
- Script post-response di login/register: auto set token ke collection variable
