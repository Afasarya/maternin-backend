-- Family-circle CRUD and notification recipient lookup filter by profile.
CREATE INDEX "family_circle_pregnancy_profile_id_idx"
ON "family_circle"("pregnancy_profile_id");
