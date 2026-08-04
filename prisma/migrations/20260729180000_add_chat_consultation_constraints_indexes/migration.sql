-- CreateEnum
CREATE TYPE "ChatSenderType" AS ENUM ('user', 'ai');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('open', 'closed');

-- AlterTable
ALTER TABLE "chat_messages"
ADD COLUMN "reply_to_message_id" UUID,
ADD COLUMN "disclaimer_included" BOOLEAN,
ALTER COLUMN "sender_type" TYPE "ChatSenderType" USING ("sender_type"::"ChatSenderType");

-- AlterTable
ALTER TABLE "consultations"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "ConsultationStatus" USING ("status"::"ConsultationStatus"),
ALTER COLUMN "status" SET DEFAULT 'open';

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_reply_to_message_id_key" ON "chat_messages"("reply_to_message_id");

-- CreateIndex
CREATE INDEX "chat_messages_pregnancy_profile_id_created_at_idx" ON "chat_messages"("pregnancy_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "consultations_pregnancy_profile_id_created_at_idx" ON "consultations"("pregnancy_profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;