ALTER TABLE "sync_queue" ADD COLUMN "submitted_by_id" UUID;

-- Existing rows cannot be attributed safely. Remove only stale transport queue
-- metadata; domain ANC/check-in records remain intact.
DELETE FROM "sync_queue" WHERE "submitted_by_id" IS NULL;

ALTER TABLE "sync_queue" ALTER COLUMN "submitted_by_id" SET NOT NULL;
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "sync_queue_submitted_by_id_device_uuid_idx"
  ON "sync_queue"("submitted_by_id", "device_uuid");