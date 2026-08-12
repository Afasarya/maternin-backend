CREATE TYPE "BidanTriageAction" AS ENUM ('acknowledge', 'override_badge', 'dismiss');

ALTER TABLE "risk_assessments"
ADD COLUMN "alert_delivery_status" TEXT,
ADD COLUMN "anemia_is_mock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bidan_review_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "screening_not_diagnosis" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "triage_bidan_audits" (
  "id" UUID NOT NULL,
  "risk_assessment_id" UUID NOT NULL,
  "bidan_id" UUID NOT NULL,
  "action" "BidanTriageAction" NOT NULL,
  "previous_risk_badge" "RiskBadge" NOT NULL,
  "new_risk_badge" "RiskBadge",
  "rationale" TEXT,
  "ai_response" JSONB NOT NULL,
  "request_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "triage_bidan_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "triage_bidan_audits_risk_assessment_id_created_at_idx" ON "triage_bidan_audits"("risk_assessment_id", "created_at");
CREATE INDEX "triage_bidan_audits_bidan_id_created_at_idx" ON "triage_bidan_audits"("bidan_id", "created_at");
ALTER TABLE "triage_bidan_audits" ADD CONSTRAINT "triage_bidan_audits_risk_assessment_id_fkey" FOREIGN KEY ("risk_assessment_id") REFERENCES "risk_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "triage_bidan_audits" ADD CONSTRAINT "triage_bidan_audits_bidan_id_fkey" FOREIGN KEY ("bidan_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;