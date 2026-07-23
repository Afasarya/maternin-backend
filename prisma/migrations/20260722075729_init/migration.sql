-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ibu_hamil', 'bidan', 'kader', 'admin');

-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('hamil', 'nifas', 'selesai');

-- CreateEnum
CREATE TYPE "RiskBadge" AS ENUM ('hijau', 'kuning', 'merah');

-- CreateEnum
CREATE TYPE "AncSource" AS ENUM ('self', 'nakes', 'kader_offline');

-- CreateEnum
CREATE TYPE "CheckinType" AS ENUM ('pregnancy', 'postpartum');

-- CreateEnum
CREATE TYPE "BleedingLevel" AS ENUM ('normal', 'banyak', 'sangat_banyak');

-- CreateEnum
CREATE TYPE "WoundCondition" AS ENUM ('baik', 'bau', 'bengkak_merah');

-- CreateEnum
CREATE TYPE "MoodFlag" AS ENUM ('baik', 'kadang_sedih', 'sering_sedih');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('wa_patient', 'wa_bidan', 'wa_family', 'in_app');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'no_device_fallback');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('anc_checkup', 'postpartum_checkin');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('active', 'paused', 'done');

-- CreateEnum
CREATE TYPE "NotifyOn" AS ENUM ('merah_only', 'semua_perubahan');

-- CreateEnum
CREATE TYPE "SyncPayloadType" AS ENUM ('anc_record', 'symptom_checkin');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "SymptomSource" AS ENUM ('self', 'kader_offline');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "puskesmas_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pregnancy_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "hpht" DATE NOT NULL,
    "hpl" DATE NOT NULL,
    "gravida" INTEGER NOT NULL,
    "existing_conditions" JSONB DEFAULT '[]',
    "status" "PregnancyStatus" NOT NULL DEFAULT 'hamil',
    "nifas_start_date" DATE,
    "had_preeclampsia_history" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pregnancy_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anc_records" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "source" "AncSource" NOT NULL,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "weight_kg" DECIMAL(5,2),
    "fundal_height_cm" DECIMAL(5,2),
    "protein_urine" TEXT,
    "platelet_count" DECIMAL(10,2),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anc_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symptom_checkins" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "checkin_type" "CheckinType" NOT NULL,
    "answers" JSONB NOT NULL,
    "conjunctiva_image_url" TEXT,
    "source" "SymptomSource" NOT NULL,
    "client_uuid" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "symptom_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "symptom_checkin_id" UUID,
    "triage_score" DECIMAL(5,2) NOT NULL,
    "anemia_probability" DECIMAL(5,4),
    "preeclampsia_probability" DECIMAL(5,4),
    "aggregate_score" DECIMAL(5,2) NOT NULL,
    "risk_badge" "RiskBadge" NOT NULL,
    "risk_factors" JSONB NOT NULL,
    "recommendation_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postpartum_logs" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "day_number" INTEGER NOT NULL,
    "bleeding_level" "BleedingLevel" NOT NULL,
    "fever" BOOLEAN NOT NULL,
    "wound_condition" "WoundCondition" NOT NULL,
    "headache_severe" BOOLEAN NOT NULL,
    "mood_flag" "MoodFlag" NOT NULL,
    "red_flag_triggered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postpartum_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_circle" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "notify_on" "NotifyOn" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puskesmas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "wilayah_kerja" TEXT NOT NULL,

    CONSTRAINT "puskesmas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_log" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "reminder_type" "ReminderType" NOT NULL,
    "cadence_days" INTEGER NOT NULL,
    "next_trigger_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue" (
    "id" UUID NOT NULL,
    "device_uuid" TEXT NOT NULL,
    "payload_type" "SyncPayloadType" NOT NULL,
    "payload" JSONB NOT NULL,
    "client_created_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "client_uuid" UUID NOT NULL,

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "sender_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "users_puskesmas_id_idx" ON "users"("puskesmas_id");

-- CreateIndex
CREATE INDEX "pregnancy_profiles_user_id_idx" ON "pregnancy_profiles"("user_id");

-- CreateIndex
CREATE INDEX "pregnancy_profiles_status_idx" ON "pregnancy_profiles"("status");

-- CreateIndex
CREATE INDEX "anc_records_pregnancy_profile_id_recorded_at_idx" ON "anc_records"("pregnancy_profile_id", "recorded_at");

-- CreateIndex
CREATE INDEX "risk_assessments_pregnancy_profile_id_created_at_idx" ON "risk_assessments"("pregnancy_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_assessments_risk_badge_idx" ON "risk_assessments"("risk_badge");

-- CreateIndex
CREATE INDEX "reminders_next_trigger_at_idx" ON "reminders"("next_trigger_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_queue_client_uuid_key" ON "sync_queue"("client_uuid");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_puskesmas_id_fkey" FOREIGN KEY ("puskesmas_id") REFERENCES "puskesmas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_profiles" ADD CONSTRAINT "pregnancy_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anc_records" ADD CONSTRAINT "anc_records_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anc_records" ADD CONSTRAINT "anc_records_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptom_checkins" ADD CONSTRAINT "symptom_checkins_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_symptom_checkin_id_fkey" FOREIGN KEY ("symptom_checkin_id") REFERENCES "symptom_checkins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postpartum_logs" ADD CONSTRAINT "postpartum_logs_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle" ADD CONSTRAINT "family_circle_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
