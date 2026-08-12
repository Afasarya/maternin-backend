CREATE TYPE "NutritionMealPeriod" AS ENUM ('breakfast', 'lunch', 'dinner', 'snack', 'mixed', 'unspecified');

CREATE TABLE "nutrition_daily_logs" (
    "id" UUID NOT NULL,
    "pregnancy_profile_id" UUID NOT NULL,
    "log_date" DATE NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    "total_calories" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "total_iron_mg" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "total_protein_g" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "total_calcium_mg" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "entry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nutrition_daily_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "nutrition_activity_logs"
ADD COLUMN "nutrition_daily_log_id" UUID,
ADD COLUMN "meal_period" "NutritionMealPeriod" NOT NULL DEFAULT 'unspecified';

CREATE UNIQUE INDEX "nutrition_daily_logs_pregnancy_profile_id_log_date_key" ON "nutrition_daily_logs"("pregnancy_profile_id", "log_date");
CREATE INDEX "nutrition_daily_logs_pregnancy_profile_id_log_date_idx" ON "nutrition_daily_logs"("pregnancy_profile_id", "log_date");
CREATE INDEX "nutrition_activity_logs_nutrition_daily_log_id_created_at_idx" ON "nutrition_activity_logs"("nutrition_daily_log_id", "created_at");

ALTER TABLE "nutrition_daily_logs" ADD CONSTRAINT "nutrition_daily_logs_pregnancy_profile_id_fkey" FOREIGN KEY ("pregnancy_profile_id") REFERENCES "pregnancy_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_activity_logs" ADD CONSTRAINT "nutrition_activity_logs_nutrition_daily_log_id_fkey" FOREIGN KEY ("nutrition_daily_log_id") REFERENCES "nutrition_daily_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;