-- Postpartum data is stored exclusively in postpartum_logs.
-- Abort rather than discard or reinterpret legacy symptom check-ins.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "symptom_checkins"
    WHERE "checkin_type" = 'postpartum'
  ) THEN
    RAISE EXCEPTION 'Cannot remove CheckinType.postpartum while legacy rows still exist';
  END IF;
END $$;

CREATE TYPE "CheckinType_new" AS ENUM ('pregnancy');
ALTER TABLE "symptom_checkins"
  ALTER COLUMN "checkin_type" TYPE "CheckinType_new"
  USING ("checkin_type"::text::"CheckinType_new");
ALTER TYPE "CheckinType" RENAME TO "CheckinType_old";
ALTER TYPE "CheckinType_new" RENAME TO "CheckinType";
DROP TYPE "CheckinType_old";
