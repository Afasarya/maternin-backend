-- Backfill records created under the previous linear model.
-- Before PregnancyOutcome existed, every profile that left `hamil` represented
-- the persalinan -> nifas -> selesai lifecycle.
UPDATE "pregnancy_profiles"
SET
  "pregnancy_outcome" = 'persalinan',
  "ended_at" = COALESCE("nifas_start_date"::timestamp(3), "updated_at")
WHERE
  "status" IN ('nifas', 'selesai')
  AND "pregnancy_outcome" IS NULL;
