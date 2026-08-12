# MaternIn AI Service — Backend Integration Guide

> Dokumen ini untuk tim backend (NestJS) supaya integrasi API ke AI service lancar dan kontrak HTTP jelas dua arah.

---

## 0. Ringkasan Singkat

AI service adalah **FastAPI microservice** yang dipanggil oleh **NestJS backend** lewat HTTP. Backend **tidak pernah bicara langsung ke LLM/ML model** — semua lewat endpoint AI service.

**Arah komunikasi:**

```
┌─────────────┐         ┌────────────────────┐         ┌──────────────┐
│  Frontend   │ ──────▶ │  NestJS Backend    │ ──────▶ │  AI Service  │
│  (Next.js)  │ ◀────── │  (orchestrator)    │ ◀────── │  (FastAPI)   │
└─────────────┘         └────────────────────┘         └──────────────┘
                                                          │
                                                          ├─▶ ML models (LR, CV, XGB)
                                                          ├─▶ LLM (custom AI API)
                                                          └─▶ WA Gateway (Fonnte)
```

**Kontrak tetap:**
- Semua request dari NestJS → AI Service **wajib** kirim `X-Internal-Token` header
- AI Service → NestJS callback **wajib** kirim `X-Internal-Token` + `X-Request-Id` header
- Token harus sama di kedua sisi (shared secret dari `.env`)

---

## 1. Auth & Tracing

### 1.1 X-Internal-Token (wajib, shared secret)

Dipakai untuk validasi service-to-service. AI service akan reject `401 Unauthorized` kalau token salah/kosong.

**Cara baca di backend NestJS:**

```ts
// src/ai/ai.service.ts
const response = await firstValueFrom(
  this.httpService.post(
    `${process.env.AI_SERVICE_URL}/api/v1/triage/analyze`,
    payload,
    {
      headers: {
        'X-Internal-Token': process.env.AI_INTERNAL_SERVICE_TOKEN,
        'Content-Type': 'application/json',
        'X-Request-Id': request.id, // propagate ke tracing
      },
      timeout: 30000, // AI pipeline bisa sampai 10-15 detik (LLM call)
    },
  ),
);
```

**Env var di NestJS:**
```
AI_SERVICE_URL=http://localhost:7860
AI_INTERNAL_SERVICE_TOKEN=<sama dengan INTERNAL_SERVICE_TOKEN di AI service>
```

### 1.2 X-Request-Id (recommended, tracing)

Buat tracing lintas service. Kalau NestJS generate per request, AI service bakal log pakai ID yang sama — memudahkan debug.

```
Request → NestJS generate X-Request-Id → kirim ke AI Service → AI log pakai ID yang sama
Response dari AI → teruskan X-Request-Id yang sama → frontend
```

---

## 2. Daftar Endpoint

Semua endpoint prefix `/api/v1` dan butuh `X-Internal-Token`.

| Method | Path | Prioritas | Fungsi |
|---|---|---|---|
| `POST` | `/api/v1/triage/analyze` | **P0** | Skrining risiko kehamilan (preeklampsia + anemia + gejala) |
| `POST` | `/api/v1/triage/{triage_id}/bidan-confirm` | **P0** | Bidan acknowledge / override hasil skrining |
| `POST` | `/api/v1/chat` | **P0** | Chatbot edukasi ibu hamil |
| `POST` | `/api/v1/postpartum/evaluate` | **P1** | Evaluasi checklist nifas harian (red flags + mental health) |
| `POST` | `/api/v1/trend/predict` | **P1** | Prediksi tren risiko dari histori skor |
| `POST` | `/api/v1/visit-brief/generate` | **P2** | Generate ringkasan kunjungan bidan |
| `POST` | `/api/v1/nutrition/parse` | **P2** | Parse laporan makan harian |
| `GET` | `/health` | — | Health check (no auth) |

---

## 3. Endpoint Detail

### 3.1 POST `/api/v1/triage/analyze` (P0 — JANGAN SKIP INI)

**Kapan dipanggil:** setiap kali ibu hamil submit checkin gejala harian atau bidan input ANC.

**Request body:**
```json
{
  "pregnancy_profile_id": "uuid",
  "symptom_checkin_id": "uuid",
  "answers": {
    "bengkak_kaki": true,
    "sakit_kepala": "berat",
    "pandangan_kabur": false
  },
  "conjunctiva_image_url": "https://storage.../image.jpg",
  "latest_anc": {
    "systolic": 120,
    "diastolic": 80,
    "protein_urine": "negatif",
    "weight_kg": 65.5,
    "fundal_height_cm": 28,
    "platelet_count": 250000
  },
  "has_preeclampsia_history": false,
  "bidan_phone": "6281234567890"
}
```

**Field penting:**
- `bidan_phone` → format `62xxx` (untuk WA Gateway Fonnte). Wajib kalau mau auto-alert kalau hasil = `merah`.
- `conjunctiva_image_url` → opsional. Kalau ada, AI service download & run anemia detection.
- `latest_anc` → kalau tidak ada, AI service pakai default (120/80).

**Response:**
```json
{
  "risk_badge": "kuning",
  "aggregate_score": 52.3,
  "risk_factors": [
    "Tekanan darah tinggi (≥140/90)",
    "Sakit kepala hebat"
  ],
  "recommendation_text": "⚡ Perhatian — Risiko Sedang...",
  "triage_score": 35.0,
  "anemia_probability": 0.42,
  "preeclampsia_probability": 0.31,
  "alert_delivery_status": "not_triggered",
  "anemia_is_mock": false,
  "bidan_review_required": false,
  "disclaimer": "Hasil ini adalah SKRINING OTOMATIS...",
  "screening_not_diagnosis": true
}
```

**Yang harus dilakukan NestJS setelah dapat response:**

1. **Simpan seluruh field ke tabel `risk_assessment`** (jangan cuma field tertentu) — buat histori tren dan audit.
2. **Tampilkan disclaimer** ke frontend apa adanya (compliance, sudah ditambahkan AI tapi tetep harus ditampilin UI).
3. **Field `bidan_review_required: true`** → artinya:
   - AI service udah trigger WA skrining ke bidan (kalau `bidan_phone` ada)
   - Bidan WAJIB acknowledge via endpoint `/triage/{id}/bidan-confirm` sebelum status final
   - Tampilkan banner peringatan di UI bidan
4. **Field `anemia_is_mock: true`** → artinya anemia_probability BUKAN hasil inferensi nyata, hanya placeholder. Tandai di DB sebagai `unverified` dan jangan dipakai untuk keputusan klinis.

**Pipeline internal AI service** (butuh tau buat debugging):

```
Lapis 1: Rule-based (PNPK) → triage_score + red_flags
   ↓
Inferensi paralel: LR Preeklampsia + CV Anemia (kalau ada gambar)
   ↓
Lapis 2: Aggregator → aggregate_score + risk_badge
   ↓
Lapis 3: LLM → recommendation_text (narasi)
   ↓
Jika badge = merah → kirim WA skrining ke bidan_phone
   ↓
Callback ke NestJS /internal/risk-assessments (fire-and-forget, retry 3x)
```

**Response time:** ~2-5 detik normal (rule + ML), ~10-15 detik kalau LLM lagi lambat. Set timeout NestJS minimal 30 detik.

---

### 3.2 POST `/api/v1/triage/{triage_id}/bidan-confirm` (P0)

**Kapan dipanggil:** bidan klik tombol "Sudah Ditangani" / "Override Badge" / "False Positive" di frontend.

**Request body:**
```json
{
  "bidan_id": "uuid",
  "action": "acknowledge",
  "new_risk_badge": "kuning",
  "rationale": "Sudah diperiksa, tekanan darah normal saat pengukuran ulang"
}
```

**Action values:**
- `acknowledge` → bidan udah tangani. `rationale` opsional.
- `override_badge` → bidan ganti badge AI. `new_risk_badge` + `rationale` WAJIB.
- `dismiss` → bidan nilai false positive. `rationale` opsional.

**Response:** dict dengan `status`/`new_badge` + `audit_trail: "logged"`.

**Yang harus dilakukan NestJS:**
- Simpan ke tabel audit log (untuk compliance jejak keputusan klinis)
- Kalau `override_badge`, update field `risk_badge` di `risk_assessment` sesuai `new_badge`
- `triage_id` = `risk_assessment.id` dari NestJS

---

### 3.3 POST `/api/v1/chat` (P0)

**Kapan dipanggil:** user kirim pesan di UI chatbot.

**Request:**
```json
{
  "pregnancy_profile_id": "uuid",
  "message": "Apakah makan nanas bahaya untuk ibu hamil?"
}
```

**Response:**
```json
{
  "reply": "Halo! Makan nanas dalam jumlah kecil umumnya aman...",
  "disclaimer_included": true
}
```

**Note penting:**
- AI **tidak akan** bikin diagnosis. Kalau user nanya hal klinis spesifik, AI bakal jawab generik + disclaimer.
- `disclaimer_included: true` → WAJIB ditampilin ke user di UI.
- Rate limit: NestJS harus implement (AI service ga punya rate limit built-in).

---

### 3.4 POST `/api/v1/postpartum/evaluate` (P1)

**Kapan dipanggil:** ibu nifas submit checklist harian (perdarahan, demam, luka, mood).

**Request:**
```json
{
  "pregnancy_profile_id": "uuid",
  "had_preeclampsia_history": false,
  "logs": [
    {
      "day_number": 3,
      "bleeding_level": "banyak",
      "fever": true,
      "wound_condition": "baik",
      "headache_severe": false,
      "mood_flag": "baik"
    }
  ],
  "bidan_phone": "6281234567890"
}
```

**Response:**
```json
{
  "red_flag_triggered": true,
  "reason": "Hari ke-3: Perdarahan banyak + Demam",
  "mental_health_flag": false
}
```

**Red flag criteria:**
- Perdarahan `banyak` / `sangat_banyak`
- Demam `true`
- Luka `bau` / `bengkak_merah`
- Sakit kepala hebat + riwayat preeklampsia (risiko eklamsia)

**Mental health flag:**
- 3+ hari berturut `sering_sedih`, atau 5+ hari total (window historis)

**Yang harus dilakukan NestJS:**
- Kalau `red_flag_triggered: true` → kirim alert ke bidan (bisa lewat notifikasi internal, atau trigger WA terpisah dari AI service)
- AI service **TIDAK** kirim WA untuk postpartum (beda dari triage). Alert postpartum = tanggung jawab NestJS.

**Callback otomatis:** AI service bakal callback `POST /internal/postpartum-flags` kalau ada flag.

---

### 3.5 POST `/api/v1/trend/predict` (P1)

**Kapan dipanggil:** frontend mau tampil grafik prediksi tren untuk bidan.

**Request:**
```json
{
  "pregnancy_profile_id": "uuid",
  "score_history": [
    { "aggregate_score": 25.0, "created_at": "2026-08-01T00:00:00Z" },
    { "aggregate_score": 32.5, "created_at": "2026-08-08T00:00:00Z" }
  ]
}
```

**Minimal 2 titik data.** Response prediksi dari regresi linear sederhana:

```json
{
  "trend_direction": "naik",
  "predicted_badge_in_days": 12,
  "predicted_badge": "merah",
  "confidence_note": "Berdasarkan 2 titik data — prediksi sangat awal..."
}
```

**Direction:**
- `naik` → slope > 1 point/hari
- `turun` → slope < -1
- `stabil` → slope dalam range [-1, 1]

**Note untuk backend:**
- Confidence note HARUS ditampilin apa adanya (transparansi).
- AI eksplisit gak over-engineer (PRD: simple linear regression cukup).

---

### 3.6 POST `/api/v1/visit-brief/generate` (P2)

**Kapan dipanggil:** bidan buka detail profile ibu hamil → klik "Generate Brief".

**Request:**
```json
{
  "pregnancy_profile_id": "uuid",
  "anc_history": [/* dari tabel ANC */],
  "risk_assessments": [/* dari tabel risk_assessment */],
  "postpartum_logs": [/* dari tabel postpartum_log */]
}
```

**Response:**
```json
{
  "brief_text": "Ibu R, usia 28 tahun, G2P1, ANC terakhir..."
}
```

Brief 2-3 kalimat untuk ringkasan kunjungan. Tidak perlu simpan ke DB — generate ulang on-demand.

---

### 3.7 POST `/api/v1/nutrition/parse` (P2)

**Kapan dipanggil:** user input laporan makan harian dari WhatsApp (contoh: "hari ini makan nasi 2 centong, sayur lodeh, ikan goreng").

**Request:**
```json
{
  "pregnancy_profile_id": "uuid",
  "raw_message": "hari ini makan nasi 2 centong, tempe goreng, sayur bayam"
}
```

**Response:**
```json
{
  "parsed_items": [
    { "name": "nasi", "portion_estimate": "2 centong" },
    { "name": "tempe goreng", "portion_estimate": "2 potong" },
    { "name": "sayur bayam", "portion_estimate": "1 mangkok" }
  ],
  "insight_text": "Asupan zat besi cukup baik hari ini..."
}
```

**Note:** hasil parsing **estimasi kasar**, bukan angka presisi. Tampilkan disclaimer.

---

### 3.8 GET `/health` (no auth)

Cek apakah AI service hidup. Return `{"status": "ok", "service": "maternin-ai"}`.

**Cara pakai di NestJS:**
- Bisa pakai buat Docker healthcheck di compose
- Bisa dicek tiap startup backend

---

## 4. Callback dari AI Service ke NestJS

AI service **tidak selalu synchronous**. Untuk 2 event penting, AI service **kirim balik** ke NestJS.

### 4.1 POST `/internal/risk-assessments`

**Dipanggil setiap selesai** `POST /api/v1/triage/analyze`. Fire-and-forget, retry 3x exponential backoff.

**Payload yang dikirim AI:**
```json
{
  "pregnancy_profile_id": "uuid",
  "symptom_checkin_id": "uuid",
  "triage_score": 35.0,
  "anemia_probability": 0.42,
  "preeclampsia_probability": 0.31,
  "aggregate_score": 52.3,
  "risk_badge": "kuning",
  "risk_factors": ["Tekanan darah tinggi", "Sakit kepala hebat"],
  "recommendation_text": "⚡ Perhatian...",
  "alert_delivery_status": "sent",
  "anemia_is_mock": false
}
```

**Catatan implementasi:**
- AI sudah return hasil lengkap di response `triage/analyze`. Callback ini **untuk memastikan persistency** kalau frontend close tab sebelum NestJS selesai save.
- Endpoint NestJS wajib validasi `X-Internal-Token` (sama shared secret).
- **Idempotent**: kalau NestJS udah simpan assessment_id yang sama, skip.
- Timeout: 5 detik. Retry: 3x dengan backoff 0.5s → 1s → 2s.
- Kalau gagal semua retry, AI log error tapi **tidak crash** — response ke caller tetep 200.

### 4.2 POST `/internal/postpartum-flags`

**Dipanggil HANYA kalau** `red_flag_triggered: true` ATAU `mental_health_flag: true`.

```json
{
  "pregnancy_profile_id": "uuid",
  "red_flag_triggered": true,
  "reason": "Hari ke-3: Perdarahan banyak",
  "mental_health_flag": false
}
```

**Catatan:** AI **tidak kirim WA** untuk postpartum. NestJS yang handle alert (bisa push notif, SMS, atau WA Gateway lain).

---

## 5. Alur End-to-End per Fitur

### 5.1 Checkin Harian (Ibu Hamil)

```
Frontend (Ibu Hamil)
  │
  │ submit checkin
  ▼
NestJS
  │
  │ POST /api/v1/triage/analyze (pakai X-Internal-Token + X-Request-Id)
  │
  ▼
AI Service
  │
  ├─▶ Rule-based (Lapis 1)
  ├─▶ LR Preeklampsia (paralel)
  ├─▶ CV Anemia (paralel, kalau ada gambar)
  ├─▶ Aggregator (Lapis 2)
  ├─▶ LLM Narasi (Lapis 3)
  │
  │ Jika badge=merah + ada bidan_phone → kirim WA skrining via Fonnte
  │
  ▼
NestJS
  │ response ke frontend
  ▼
Frontend tampilkan badge + disclaimer + risk_factors

[Fire-and-forget]
AI Service ─POST /internal/risk-assessments──▶ NestJS
                                              │
                                              └─▶ save ke DB (upsert idempotent)
```

### 5.2 Bidan Acknowledge

```
Frontend (Bidan Dashboard)
  │
  │ klik tombol "Sudah Ditangani" / "Override"
  ▼
NestJS
  │
  │ POST /api/v1/triage/{triage_id}/bidan-confirm
  │
  ▼
AI Service
  │
  │ return ack
  │
  ▼
NestJS save audit log + update risk_badge kalau override
```

### 5.3 Chatbot

```
Frontend (Ibu Hamil)
  │
  │ kirim pesan
  ▼
NestJS
  │
  │ POST /api/v1/chat
  │
  ▼
AI Service
  │
  ├─▶ LLM dengan grounding KB (Buku KIA Kemenkes)
  │
  │ return reply + disclaimer_included
  │
  ▼
Frontend tampilkan reply + disclaimer
```

### 5.4 Postpartum Checkin Harian

```
Frontend (Ibu Nifas)
  │
  │ submit checklist harian
  ▼
NestJS
  │
  │ POST /api/v1/postpartum/evaluate
  │
  ▼
AI Service
  │
  ├─▶ Rule-based: cek perdarahan, demam, luka, sakit kepala, mood
  │
  │ return red_flag_triggered + reason + mental_health_flag
  │
  ▼
NestJS save ke DB

[Fire-and-forget, HANYA kalau flag triggered]
AI Service ─POST /internal/postpartum-flags──▶ NestJS
                                             │
                                             └─▶ trigger alert bidan (notifikasi sendiri)
```

---

## 6. Error Handling

### 6.1 Response error dari AI Service

| Status | Penyebab | Tindakan NestJS |
|---|---|---|
| `401` | Token salah/kosong | Cek env `AI_INTERNAL_SERVICE_TOKEN` |
| `422` | Request body invalid | Tampilkan validation error ke user |
| `500` | Internal error AI (LLM timeout, ML model crash) | Tampilkan "AI sementara tidak tersedia", retry bisa dilakukan |
| `503` | Model belum loaded (jarang, biasanya startup) | Retry setelah 5 detik |

**Body error dari FastAPI:**
```json
{
  "detail": "Invalid or missing X-Internal-Token"
}
```

AI service **tidak expose** stack trace atau detail internal (aman).

### 6.2 AI Service tidak bisa kirim callback

- AI retry 3x dengan backoff. Kalau gagal semua → log error di AI service, response ke caller tetep 200.
- NestJS harus **tetap simpan hasil dari response `triage/analyze`** walaupun callback gagal. Jangan tunggu callback.
- Implement healthcheck `/health` di NestJS startup — kalau AI service down, kasih fallback di frontend (misal: "Skrining AI tidak tersedia, hubungi bidan langsung").

---

## 7. Environment Variables (referensi)

**AI service** (`.env` di `ai-service/`):
```
INTERNAL_SERVICE_TOKEN=<shared secret>
NESTJS_INTERNAL_BASE_URL=http://host.docker.internal:3000  # atau url nestjs production
FONNTE_API_KEY=<fonnte token>
AI_API_BASE_URL=https://labs.inxorastudio.com/v1
AI_API_KEY=<AI API key>
AI_MODEL=ixlabs/gpt-5.6-luna
AI_TIMEOUT_SECONDS=25
AI_MAX_RETRIES=2
```

**NestJS backend** (`.env`):
```
AI_SERVICE_URL=https://ai.maternin.my.id     # atau http://localhost:7860 untuk dev
AI_INTERNAL_SERVICE_TOKEN=<sama dengan INTERNAL_SERVICE_TOKEN di AI service>
```

**PENTING:** Token harus **byte-for-byte identik** di kedua sisi. Karakter spasi/newline akan bikin 401.

---

## 8. Checklist Integrasi Backend

- [ ] Set `AI_SERVICE_URL` di NestJS `.env`
- [ ] Set `AI_INTERNAL_SERVICE_TOKEN` di NestJS `.env` (sama dengan AI service)
- [ ] Implement HTTP client dengan timeout 30 detik untuk `triage/analyze`
- [ ] Tambah middleware/guard untuk `X-Internal-Token` dan `X-Request-Id` propagation
- [ ] Implement endpoint internal NestJS:
  - [ ] `POST /internal/risk-assessments` — validasi token, idempotent save
  - [ ] `POST /internal/postpartum-flags` — validasi token, trigger alert
- [ ] Simpan response `triage/analyze` lengkap ke `risk_assessment` (semua field, termasuk disclaimer)
- [ ] Tampilkan disclaimer dari response di UI (jangan dihapus)
- [ ] Tandai `anemia_is_mock: true` di DB sebagai `unverified`
- [ ] Implement `/health` check di startup NestJS (graceful fallback kalau AI down)
- [ ] Implement rate limiting untuk `chat` dan `nutrition/parse` (AI ga punya built-in)
- [ ] Audit log untuk `bidan-confirm` action

---

## 9. Contoh Implementasi NestJS (referensi)

```ts
// src/ai/ai.service.ts
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get('AI_SERVICE_URL');
    this.token = this.config.get('AI_INTERNAL_SERVICE_TOKEN');
  }

  private getHeaders(requestId?: string) {
    return {
      'X-Internal-Token': this.token,
      'Content-Type': 'application/json',
      ...(requestId && { 'X-Request-Id': requestId }),
    };
  }

  async analyzeTriage(payload: any, requestId: string) {
    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/api/v1/triage/analyze`,
          payload,
          {
            headers: this.getHeaders(requestId),
            timeout: 30000,
          },
        ),
      );
      return data;
    } catch (error) {
      this.logger.error(`AI analyzeTriage failed: ${error.message}`);
      throw error;
    }
  }

  async bidanConfirm(triageId: string, payload: any, requestId: string) {
    const { data } = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/v1/triage/${triageId}/bidan-confirm`,
        payload,
        { headers: this.getHeaders(requestId), timeout: 10000 },
      ),
    );
    return data;
  }

  async chat(payload: any, requestId: string) {
    const { data } = await firstValueFrom(
      this.http.post(`${this.baseUrl}/api/v1/chat`, payload, {
        headers: this.getHeaders(requestId),
        timeout: 15000,
      }),
    );
    return data;
  }

  // ... dst untuk postpartum, trend, visit-brief, nutrition
}

// src/ai/ai.controller.ts — NestJS internal callback endpoint
@Controller('internal')
export class AiCallbackController {
  @Post('risk-assessments')
  async receiveRiskAssessment(
    @Headers('x-internal-token') token: string,
    @Headers('x-request-id') requestId: string,
    @Body() payload: RiskAssessmentDto,
  ) {
    // 1. Validasi token (sama dengan AI_INTERNAL_SERVICE_TOKEN)
    if (token !== this.config.get('AI_INTERNAL_SERVICE_TOKEN')) {
      throw new UnauthorizedException();
    }
    // 2. Save ke DB (upsert by symptom_checkin_id — idempotent)
    await this.riskAssessmentService.upsertByCheckinId(payload, requestId);
    return { status: 'saved' };
  }

  @Post('postpartum-flags')
  async receivePostpartumFlag(
    @Headers('x-internal-token') token: string,
    @Body() payload: PostpartumFlagDto,
  ) {
    if (token !== this.config.get('AI_INTERNAL_SERVICE_TOKEN')) {
      throw new UnauthorizedException();
    }
    // Trigger alert bidan via channel internal NestJS
    await this.bidanAlertService.sendPostpartumAlert(payload);
    return { status: 'alert_queued' };
  }
}
```

---

## 10. Catatan Penting

1. **Disclaimer wajib ditampilin apa adanya.** Field `disclaimer` dari response `triage/analyze` adalah kontrak compliance. Jangan diformat ulang atau dihapus.

2. **`screening_not_diagnosis: true` HARUS ditampilin di UI.** Ini adalah safety message bahwa hasil AI bukan diagnosis medis.

3. **WA alert WAJIB pake framing "skrining" bukan "emergency".** Meskipun `risk_badge = merah`, tone-nya tetap skrining awal — keputusan klinis tetap di tangan bidan.

4. **Idempotency untuk callback.** AI bisa kirim callback yang sama 2x (misal retry karena timeout). NestJS harus handle dengan upsert by `symptom_checkin_id`.

5. **AI service gak rate-limit.** NestJS harus implementasi rate limit untuk endpoint yang panggil LLM (`chat`, `nutrition/parse`, `visit-brief`).

6. **Timeout konfigurasi:**
   - `triage/analyze`: 30 detik (paling lama, ada LLM)
   - `chat`: 15 detik
   - `postpartum/evaluate`, `trend/predict`: 10 detik
   - `bidan-confirm`, `nutrition/parse`, `visit-brief`: 15 detik
   - Internal callback dari NestJS: 5 detik (sesuai AI client spec)

---

**Dokumen ini generated untuk handover backend.** Update kalau ada perubahan kontrak endpoint.