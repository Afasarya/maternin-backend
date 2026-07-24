-- Guarantee idempotency for direct and offline ANC submissions.
CREATE UNIQUE INDEX "anc_records_client_uuid_key" ON "anc_records"("client_uuid");