# Panduan Integrasi API MaternIn untuk Flutter

Dokumen ini menjadi acuan FE mobile saat mengakses backend MaternIn.

## 1. Base URL

Backend tidak memakai prefix `/api` atau `/api/v1`. Path endpoint langsung ditambahkan ke base URL.

| Lingkungan | Base URL |
|---|---|
| Android Emulator | `http://10.0.2.2:3000` |
| Perangkat fisik, satu Wi-Fi | `http://<IP-LAN-BACKEND>:3000` |
| Ngrok | `https://<DOMAIN-NGROK>` |

Contoh URL login:

```text
https://<DOMAIN-NGROK>/auth/login
```

> Jangan gunakan `localhost` dari emulator atau perangkat fisik. `localhost` menunjuk perangkat tersebut, bukan komputer backend. URL ngrok hanya aktif selama proses ngrok berjalan dan dapat berubah.

Simpan base URL lewat `--dart-define` atau konfigurasi flavor, jangan hardcode:

```dart
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);
```

## 2. Header

Request JSON:

```text
Content-Type: application/json
Accept: application/json
```

Endpoint terlindungi:

```text
Authorization: Bearer <access_token>
```

Disarankan untuk operasi create, AI, dan retry:

```text
X-Request-Id: <UUID-UNIK>
```

Jika peringatan browser ngrok mengganggu request:

```text
ngrok-skip-browser-warning: true
```

## 3. Format Respons

### Sukses

```json
{
  "status_code": 200,
  "message": "success",
  "data": {}
}
```

Nilai `data` dapat berupa object, array, atau hasil pagination.

### Gagal

```json
{
  "status_code": 400,
  "message": [
    "Nomor telepon harus diawali 08, 62, atau +62"
  ],
  "error": "Bad Request",
  "timestamp": "2026-08-12T10:00:00.000Z"
}
```

`message` dapat berupa `String` atau `List<String>`. FE harus menangani keduanya. Backend menolak field asing atau nama field yang salah.

Contoh parser pesan error:

```dart
String apiErrorMessage(dynamic body) {
  if (body is! Map) return 'Terjadi kesalahan';

  final message = body['message'];
  if (message is List) return message.join('\n');
  if (message is String && message.isNotEmpty) return message;

  return 'Terjadi kesalahan';
}
```

## 4. Konfigurasi Dio

```dart
final dio = Dio(
  BaseOptions(
    baseUrl: apiBaseUrl,
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 30),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  ),
);
```

Saat debugging, cetak body error backend, bukan hanya pesan umum Dio:

```dart
try {
  await dio.post('/auth/login', data: payload);
} on DioException catch (error) {
  debugPrint('Status: ${error.response?.statusCode}');
  debugPrint('Response: ${error.response?.data}');
  debugPrint('Request: ${error.requestOptions.data}');
  rethrow;
}
```

## 5. Autentikasi

### Register ibu hamil

```http
POST /auth/register
```

```json
{
  "full_name": "Siti Aminah",
  "phone_number": "081234567890",
  "password": "password123",
  "email": "siti@example.com"
}
```

Ketentuan:

- `full_name` wajib.
- `phone_number` menerima `08...`, `628...`, atau `+628...`; backend menyimpan sebagai `+628...`.
- `password` minimal 8 karakter.
- Role tidak dikirim FE. Endpoint register publik selalu membuat user sebagai `ibu_hamil`.
- `email` opsional. Jangan kirim `"email": ""`; hapus field jika kosong.
- `role` dan `puskesmas_id` akan ditolak sebagai field asing.
- Gunakan nama field snake_case persis. `phoneNumber` dan `fullName` akan ditolak.

Contoh Dio:

```dart
final response = await dio.post(
  '/auth/register',
  data: {
    'full_name': fullName,
    'phone_number': phoneNumber,
    'password': password,
    if (email.trim().isNotEmpty) 'email': email.trim(),
  },
);

final auth = response.data['data'];
final accessToken = auth['access_token'] as String;
final refreshToken = auth['refresh_token'] as String;
```

### Login

```http
POST /auth/login
```

```json
{
  "phone_number": "081234567890",
  "password": "password123"
}
```

Login dibatasi 5 request per 60 detik.

Respons register/login:

```json
{
  "status_code": 200,
  "message": "success",
  "data": {
    "user": {
      "id": "<uuid>",
      "full_name": "Siti Aminah",
      "phone_number": "+6281234567890",
      "role": "ibu_hamil"
    },
    "access_token": "<jwt>",
    "refresh_token": "<opaque-token>",
    "expires_in": 900
  }
}
```

Register biasanya menghasilkan status `201`; login menghasilkan `200`.

### Refresh token

```http
POST /auth/refresh
```

```json
{
  "refresh_token": "<refresh-token-lama>"
}
```

```json
{
  "status_code": 200,
  "message": "success",
  "data": {
    "access_token": "<jwt-baru>",
    "refresh_token": "<refresh-token-baru>",
    "expires_in": 900
  }
}
```

Aturan penting:

1. Access token default berlaku 15 menit.
2. Refresh token dirotasi setiap refresh.
3. Setelah refresh sukses, simpan access token dan refresh token baru.
4. Jangan gunakan kembali refresh token lama.
5. Jalankan maksimal satu proses refresh pada waktu sama.
6. Retry request asli maksimal satu kali setelah refresh.
7. Simpan token dalam secure storage, bukan `SharedPreferences`.

### Logout

```http
POST /auth/logout
```

```json
{
  "refresh_token": "<refresh-token>"
}
```

Respons `204 No Content`. Jangan mencoba parse body JSON pada status `204`.

## 6. Endpoint Utama Mobile

Semua endpoint berikut memerlukan bearer token.

### User dan fasilitas

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/users/me` | Profil user login |
| `PATCH` | `/users/me` | Ubah profil user |
| `GET` | `/facilities/puskesmas` | Daftar puskesmas |
| `GET` | `/facilities/puskesmas/:id` | Detail puskesmas |
| `GET` | `/facilities/nearby` | Puskesmas terdekat; khusus ibu hamil |

### Profil kehamilan

| Method | Path | Keterangan |
|---|---|---|
| `POST` | `/pregnancy-profiles` | Buat profil kehamilan |
| `GET` | `/pregnancy-profiles` | Daftar profil milik user |
| `GET` | `/pregnancy-profiles/:id` | Detail profil |
| `PATCH` | `/pregnancy-profiles/:id` | Ubah profil |

Contoh create:

```json
{
  "hpht": "2026-01-15",
  "gravida": 1,
  "existing_conditions": ["hipertensi"],
  "had_preeclampsia_history": false
}
```

`hpht` wajib memakai format `YYYY-MM-DD`.

### Catatan ANC

| Method | Path |
|---|---|
| `POST` | `/anc-records` |
| `GET` | `/anc-records?pregnancy_profile_id=<uuid>` |
| `GET` | `/anc-records/latest?pregnancy_profile_id=<uuid>` |
| `GET` | `/anc-records/:id` |

Contoh create:

```json
{
  "pregnancy_profile_id": "<uuid>",
  "systolic": 120,
  "diastolic": 80,
  "weight_kg": 58.5,
  "fundal_height_cm": 24,
  "protein_urine": "negatif",
  "platelet_count": 250000,
  "recorded_at": "2026-08-12T08:00:00.000Z",
  "client_uuid": "<uuid>"
}
```

### Check-in gejala dan risiko

| Method | Path |
|---|---|
| `POST` | `/symptom-checkins` |
| `GET` | `/symptom-checkins?pregnancy_profile_id=<uuid>` |
| `GET` | `/symptom-checkins/:id` |
| `GET` | `/pregnancy-profiles/:id/risk-assessments` |
| `GET` | `/risk-assessments/latest?pregnancy_profile_id=<uuid>` |
| `GET` | `/risk-assessments/:id` |
| `POST` | `/risk-assessments/trend-predict` |

Contoh check-in:

```json
{
  "pregnancy_profile_id": "<uuid>",
  "checkin_type": "pregnancy",
  "answers": {
    "sakit_kepala": "berat",
    "pandangan_kabur": true,
    "bengkak_kaki": true
  },
  "client_uuid": "<uuid>"
}
```

Pertahankan `client_uuid` dan `X-Request-Id` sama ketika retry request yang sama.

### Chat AI

| Method | Path |
|---|---|
| `POST` | `/chat` |
| `GET` | `/chat/history?pregnancy_profile_id=<uuid>` |
| `GET` | `/chat/history/:id` |

### Nutrisi

| Method | Path |
|---|---|
| `POST` | `/nutrition/parse` |
| `GET` | `/nutrition-logs?pregnancy_profile_id=<uuid>` |

```json
{
  "pregnancy_profile_id": "<uuid>",
  "raw_message": "habis sarapan bubur ayam dan teh manis"
}
```

`raw_message` maksimal 2.000 karakter.

### Masa nifas

| Method | Path |
|---|---|
| `POST` | `/postpartum-logs` |
| `GET` | `/postpartum-logs?pregnancy_profile_id=<uuid>` |
| `GET` | `/postpartum-logs/:id` |

```json
{
  "pregnancy_profile_id": "<uuid>",
  "day_number": 7,
  "bleeding_level": "normal",
  "fever": false,
  "wound_condition": "baik",
  "headache_severe": false,
  "mood_flag": "baik",
  "client_uuid": "<uuid>"
}
```

`day_number` harus 1–42.

### Family Circle

| Method | Path |
|---|---|
| `POST` | `/family-circle` |
| `GET` | `/family-circle?pregnancy_profile_id=<uuid>` |
| `GET` | `/family-circle/:id` |
| `PATCH` | `/family-circle/:id` |
| `DELETE` | `/family-circle/:id` |

```json
{
  "pregnancy_profile_id": "<uuid>",
  "contact_name": "Budi",
  "contact_phone": "+6281234567890",
  "relation": "suami",
  "notify_on": "merah_only"
}
```

### Reminder dan notifikasi

| Method | Path |
|---|---|
| `GET` | `/reminders?pregnancy_profile_id=<uuid>` |
| `GET` | `/reminders/:id` |
| `GET` | `/notifications?pregnancy_profile_id=<uuid>` |
| `GET` | `/notifications/:id` |

### Dokter dan konsultasi

| Method | Path |
|---|---|
| `GET` | `/doctors` |
| `GET` | `/doctors/:id` |
| `POST` | `/consultations` |
| `GET` | `/consultations` |
| `GET` | `/consultations/:id` |
| `PATCH` | `/consultations/:id/cancel` |
| `GET` | `/consultations/:id/messages?limit=20&offset=0` |
| `POST` | `/consultations/:id/messages` |

Create konsultasi:

```json
{
  "pregnancy_profile_id": "<uuid>",
  "doctor_id": "<uuid>",
  "scheduled_at": "2026-08-20T09:00:00.000Z"
}
```

Kirim pesan:

```json
{
  "message": "Dok, saya mengalami pusing sejak pagi."
}
```

## 7. Enum Penting

Nilai enum case-sensitive. Kirim persis sebagai berikut.

| Enum | Nilai |
|---|---|
| `UserRole` | `ibu_hamil`, `bidan`, `kader`, `admin`, `dokter` |
| `PregnancyStatus` | `hamil`, `nifas`, `selesai` |
| `PregnancyOutcome` | `persalinan`, `keguguran` |
| `RiskBadge` | `hijau`, `kuning`, `merah` |
| `CheckinType` | `pregnancy` |
| `BleedingLevel` | `normal`, `banyak`, `sangat_banyak` |
| `WoundCondition` | `baik`, `bau`, `bengkak_merah` |
| `MoodFlag` | `baik`, `kadang_sedih`, `sering_sedih` |
| `NotifyOn` | `merah_only`, `semua_perubahan` |
| `ReminderType` | `anc_checkup`, `postpartum_checkin` |
| `ReminderStatus` | `active`, `paused`, `done` |
| `NotificationStatus` | `pending`, `sent`, `failed`, `no_device_fallback` |
| `ConsultationStatus` | `pending_payment`, `scheduled`, `ongoing`, `completed`, `cancelled`, `expired` |

## 8. Pagination, Tanggal, dan ID

- Pagination umum: `?limit=20&offset=0`.
- UUID harus valid.
- Timestamp memakai ISO-8601, contoh `2026-08-12T08:00:00.000Z`.
- `hpht` memakai `YYYY-MM-DD`.
- Nomor telepon Indonesia menerima `08...`, `62...`, atau `+62...` dan disimpan sebagai `+62...`.
- Jangan kirim field bernilai string kosong jika field tersebut opsional.

## 9. Checklist Debugging

Jika mendapat `400 Bad Request`:

1. Cetak `error.response?.data`.
2. Pastikan field memakai snake_case.
3. Hapus field tambahan dan field opsional yang kosong.
4. Pastikan enum lowercase dan sesuai daftar.
5. Pastikan UUID dan tanggal valid.
6. Untuk bidan/kader, pastikan `puskesmas_id` dikirim.

Jika mendapat `401 Unauthorized`:

1. Pastikan header memakai `Bearer <access_token>`.
2. Coba refresh token satu kali.
3. Jika refresh gagal, hapus session lokal dan arahkan ke login.

Jika perangkat tidak dapat terhubung:

1. Jangan gunakan `localhost` pada perangkat.
2. Pastikan backend dan ngrok masih berjalan.
3. Pastikan base URL memakai `https://` untuk ngrok.
4. Pastikan path tidak ditambah `/api` atau `/api/v1`.

## 10. Koleksi Pengujian

Contoh request lebih lengkap tersedia dalam folder [`postman/`](./postman/), terutama:

- [`03-auth.postman_collection.json`](./postman/03-auth.postman_collection.json)
- [`05-pregnancy-profiles.postman_collection.json`](./postman/05-pregnancy-profiles.postman_collection.json)
- [`06-anc-records.postman_collection.json`](./postman/06-anc-records.postman_collection.json)
- [`07-symptom-checkins.postman_collection.json`](./postman/07-symptom-checkins.postman_collection.json)
- [`09-postpartum.postman_collection.json`](./postman/09-postpartum.postman_collection.json)
- [`10-family-circle.postman_collection.json`](./postman/10-family-circle.postman_collection.json)
- [`18-nutrition-tracking.postman_collection.json`](./postman/18-nutrition-tracking.postman_collection.json)
- [`19-consultations.postman_collection.json`](./postman/19-consultations.postman_collection.json)
