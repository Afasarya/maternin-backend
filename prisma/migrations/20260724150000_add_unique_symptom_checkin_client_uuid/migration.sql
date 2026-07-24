-- Guarantee idempotency for direct and offline symptom check-in submissions.
CREATE UNIQUE INDEX "symptom_checkins_client_uuid_key" ON "symptom_checkins"("client_uuid");
