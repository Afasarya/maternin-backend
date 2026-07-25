-- Postpartum logs can originate from retry-prone and offline clients.
ALTER TABLE "postpartum_logs" ADD COLUMN "client_uuid" UUID;
ALTER TABLE "postpartum_logs" ADD COLUMN "evaluation_reason" TEXT;
ALTER TABLE "postpartum_logs" ADD COLUMN "mental_health_flag" BOOLEAN;
ALTER TABLE "postpartum_logs" ADD COLUMN "evaluated_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "postpartum_logs_client_uuid_key"
ON "postpartum_logs"("client_uuid");

CREATE INDEX "postpartum_logs_pregnancy_profile_id_day_number_idx"
ON "postpartum_logs"("pregnancy_profile_id", "day_number");

CREATE INDEX "postpartum_logs_pregnancy_profile_id_created_at_idx"
ON "postpartum_logs"("pregnancy_profile_id", "created_at");

-- One active state row per reminder type enables atomic cadence upserts.
CREATE UNIQUE INDEX "reminders_pregnancy_profile_id_reminder_type_key"
ON "reminders"("pregnancy_profile_id", "reminder_type");
