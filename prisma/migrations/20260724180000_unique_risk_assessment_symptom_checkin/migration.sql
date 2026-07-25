-- A symptom check-in may produce at most one persisted risk assessment.
-- PostgreSQL unique indexes permit multiple NULL values, so internal callbacks
-- without a symptom_checkin_id remain valid independent assessments.
WITH ranked_assessments AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "symptom_checkin_id"
			ORDER BY "created_at" DESC, "id" DESC
		) AS "duplicate_rank"
	FROM "risk_assessments"
	WHERE "symptom_checkin_id" IS NOT NULL
)
DELETE FROM "risk_assessments"
WHERE "id" IN (
	SELECT "id"
	FROM ranked_assessments
	WHERE "duplicate_rank" > 1
);

CREATE UNIQUE INDEX "risk_assessments_symptom_checkin_id_key"
ON "risk_assessments"("symptom_checkin_id");
