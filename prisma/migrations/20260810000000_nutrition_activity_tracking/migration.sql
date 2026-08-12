CREATE TYPE "NutritionActivityLogStatus" AS ENUM ('processed', 'low_confidence', 'unmatched_sender', 'failed');

CREATE TABLE "nutrition_activity_logs" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID,
    "raw_message" TEXT NOT NULL,
    "sender_phone" VARCHAR(32) NOT NULL,
    "sender_matched" BOOLEAN NOT NULL,
    "parsed_calories" DECIMAL(6,2),
    "parsed_iron_mg" DECIMAL(6,2),
    "parsed_activity" TEXT,
    "confidence_score" DECIMAL(3,2),
    "status" "NutritionActivityLogStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nutrition_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_prompt_windows" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "last_prompt_sent_at" TIMESTAMP(3) NOT NULL,
    "window_closes_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nutrition_prompt_windows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nutrition_activity_logs_pregnancy_profile_id_created_at_idx" ON "nutrition_activity_logs"("pregnancy_profile_id", "created_at");
CREATE INDEX "nutrition_activity_logs_sender_phone_created_at_idx" ON "nutrition_activity_logs"("sender_phone", "created_at");
CREATE UNIQUE INDEX "nutrition_prompt_windows_pregnancy_profile_id_key" ON "nutrition_prompt_windows"("pregnancy_profile_id");
CREATE INDEX "nutrition_prompt_windows_window_closes_at_idx" ON "nutrition_prompt_windows"("window_closes_at");

ALTER TABLE "nutrition_activity_logs" ADD CONSTRAINT "nutrition_activity_logs_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "nutrition_prompt_windows" ADD CONSTRAINT "nutrition_prompt_windows_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;