# Task 15 — Chat Module (Proxy ke AI Service)

## Tujuan
Implementasi chat proxy yang meneruskan pesan ibu hamil ke AI Service chatbot dan menyimpan histori percakapan.

## Scope
- `POST /chat` — proxy ke AI Service `/api/v1/chat`
- Simpan histori ke `chat_messages`
- `GET /chat/history` — ambil histori chat
- Consultations management (basic)

## Detail Implementasi

### 1. File: `src/chat/chat.module.ts`
- Import: `AiServiceModule`, `PregnancyProfilesModule`
- Providers: `ChatService`
- Controllers: `ChatController`
- **Catatan:** TIDAK perlu import `PrismaModule` — sudah `@Global()`

### 2. File: `src/chat/chat.controller.ts`
- `POST /chat` — role: ibu_hamil
  - Body:
    ```json
    {
      "pregnancy_profile_id": "uuid",
      "message": "Saya sering pusing akhir-akhir ini, apakah normal?"
    }
    ```
  - Flow:
    1. Validasi profil milik user
    2. Simpan pesan user ke `chat_messages` via Prisma (sender_type = 'user')
    3. Panggil AI Service `POST /api/v1/chat`:
       ```json
       { "pregnancy_profile_id": "uuid", "message": "..." }
       ```
    4. Simpan response AI ke `chat_messages` via Prisma (sender_type = 'ai')
    5. Return response:
       ```json
       {
         "reply": "...",
         "disclaimer_included": true
       }
       ```
  - Timeout handling: 5 detik, kalau timeout return error message

- `GET /chat/history?pregnancy_profile_id=xxx` — role: owner, bidan, admin
  - Pagination (limit, offset)
  - Sort: `created_at ASC` (chronological)
  - Return list chat messages

- `GET /chat/history/:id` — role: owner, bidan, admin

### 3. File: `src/chat/chat.service.ts`
- Inject `PrismaService`, `AiServiceClient`
- `sendMessage(profileId, userId, message)`:
  - Save user message via Prisma:
    ```typescript
    await this.prisma.chatMessage.create({
      data: {
        pregnancy_profile_id: profileId,
        sender_type: 'user',
        message: message,
      },
    });
    ```
  - Call AI Service
  - Save AI reply via Prisma:
    ```typescript
    await this.prisma.chatMessage.create({
      data: {
        pregnancy_profile_id: profileId,
        sender_type: 'ai',
        message: aiResponse.reply,
      },
    });
    ```
  - Return reply
- `getHistory(profileId, pagination)`: list messages
  ```typescript
  return this.prisma.chatMessage.findMany({
    where: { pregnancy_profile_id: profileId },
    orderBy: { created_at: 'asc' },
    skip: pagination.offset,
    take: pagination.limit,
  });
  ```
- `getMessage(id)`: detail

### 4. Model `chat_messages` (sudah dari Task 02 di schema.prisma)
- Model: `ChatMessage`
- Kolom: `id`, `pregnancy_profile_id` (FK), `sender_type` ('user' | 'ai'), `message` (text), `created_at`

### 5. File: `src/chat/dto/send-chat.dto.ts`
- `@IsUUID() pregnancy_profile_id`
- `@IsString() @IsNotEmpty() message`

### 6. File: `src/consultations/consultations.module.ts` (basic)
- Model: `Consultation` (sudah dari Task 02 di schema.prisma)
- Basic CRUD — P1 priority, buat skeleton dulu
- `POST /consultations` — create consultation session
- `GET /consultations?pregnancy_profile_id=xxx` — list
- `GET /consultations/:id` — detail
- `PATCH /consultations/:id/status` — update status (open, closed)
- Semua via `PrismaService`

## Testing
- Test POST /chat → AI Service dipanggil → reply returned → both messages saved
- Test chat history → chronological order
- Test ownership: hanya bisa chat untuk profil sendiri
- Test timeout: AI Service lambat → proper error response

## Postman Collection
Generate file: `postman/15-chat-consultations.postman_collection.json`
- **Folder: Chat**
  - `POST /chat` — kirim pesan biasa
  - `POST /chat` — kirim pesan tentang gejala
  - `GET /chat/history?pregnancy_profile_id=xxx`
  - `GET /chat/history/:id`
- **Folder: Consultations**
  - `POST /consultations`
  - `GET /consultations?pregnancy_profile_id=xxx`
  - `GET /consultations/:id`
  - `PATCH /consultations/:id/status`
- **Folder: Access Control**
  - `POST /chat` — profil bukan miliknya → 403
