ALTER TABLE "risk_assessments"
ADD COLUMN "contract_version" TEXT,
ADD COLUMN "model_status" TEXT,
ADD COLUMN "model_version" TEXT,
ADD COLUMN "missing_features" JSONB DEFAULT '[]'::jsonb,
ADD COLUMN "disclaimer" TEXT,
ADD COLUMN "evaluated_at" TIMESTAMP(3);