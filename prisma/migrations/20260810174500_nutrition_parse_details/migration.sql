ALTER TABLE "nutrition_activity_logs"
ADD COLUMN "parsed_items" JSONB DEFAULT '[]',
ADD COLUMN "insight_text" TEXT;