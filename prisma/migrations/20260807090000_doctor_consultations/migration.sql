-- Preserve Task 15 data and free the consultations table name.
-- PostgreSQL does not rename constraints or indexes when a table is renamed,
-- so every legacy consultations_* object must be renamed before the new
-- consultations table creates objects with those names.
ALTER TABLE "consultations" RENAME TO "support_sessions";
ALTER TABLE "support_sessions" RENAME CONSTRAINT "consultations_pkey" TO "support_sessions_pkey";
ALTER TABLE "support_sessions" RENAME CONSTRAINT "consultations_pregnancy_profile_id_fkey" TO "support_sessions_pregnancy_profile_id_fkey";
ALTER INDEX "consultations_pregnancy_profile_id_created_at_idx" RENAME TO "support_sessions_pregnancy_profile_id_created_at_idx";
ALTER TYPE "ConsultationStatus" RENAME TO "SupportSessionStatus";

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'dokter';
CREATE TYPE "DayOfWeek" AS ENUM ('senin','selasa','rabu','kamis','jumat','sabtu','minggu');
CREATE TYPE "ConsultationStatus" AS ENUM ('pending_payment','scheduled','ongoing','completed','cancelled','expired');
CREATE TYPE "PaymentStatus" AS ENUM ('pending','paid','expired','failed','refunded');
CREATE TYPE "ConsultationSenderType" AS ENUM ('patient','doctor');

CREATE TABLE "doctors" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "specialization" TEXT NOT NULL,
  "str_number" TEXT, "price" DECIMAL(10,2) NOT NULL, "bio" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "doctor_schedules" (
  "id" UUID NOT NULL, "doctor_id" UUID NOT NULL, "day_of_week" "DayOfWeek" NOT NULL,
  "start_time" TEXT NOT NULL, "end_time" TEXT NOT NULL, CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "doctor_schedules_doctor_id_day_of_week_idx" ON "doctor_schedules"("doctor_id", "day_of_week");
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "consultations" (
  "id" UUID NOT NULL, "pregnancy_profile_id" UUID NOT NULL, "doctor_id" UUID NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL, "price_snapshot" DECIMAL(10,2) NOT NULL,
  "platform_fee" DECIMAL(10,2) NOT NULL, "status" "ConsultationStatus" NOT NULL DEFAULT 'pending_payment',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consultations_pregnancy_profile_id_created_at_idx" ON "consultations"("pregnancy_profile_id", "created_at");
CREATE INDEX "consultations_doctor_id_scheduled_at_idx" ON "consultations"("doctor_id", "scheduled_at");
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payments" (
  "id" UUID NOT NULL, "consultation_id" UUID NOT NULL, "xendit_invoice_id" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "paid_at" TIMESTAMP(3), "xendit_payload" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_consultation_id_key" ON "payments"("consultation_id");
CREATE UNIQUE INDEX "payments_xendit_invoice_id_key" ON "payments"("xendit_invoice_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "consultation_messages" (
  "id" UUID NOT NULL, "consultation_id" UUID NOT NULL, "sender_type" "ConsultationSenderType" NOT NULL,
  "sender_user_id" UUID NOT NULL, "message" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consultation_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consultation_messages_consultation_id_created_at_idx" ON "consultation_messages"("consultation_id", "created_at");
ALTER TABLE "consultation_messages" ADD CONSTRAINT "consultation_messages_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_messages" ADD CONSTRAINT "consultation_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
