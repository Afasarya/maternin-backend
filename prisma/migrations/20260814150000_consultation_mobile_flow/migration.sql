ALTER TABLE "doctors" ADD COLUMN "photo_key" TEXT;

ALTER TABLE "consultations"
  ADD COLUMN "topic" TEXT NOT NULL DEFAULT 'Konsultasi kehamilan',
  ADD COLUMN "complaint" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "duration_minutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "payments"
  ADD COLUMN "payment_url" TEXT,
  ADD COLUMN "expires_at" TIMESTAMP(3);