-- CreateEnum
CREATE TYPE "PregnancyOutcome" AS ENUM ('persalinan', 'keguguran');

-- AlterTable
ALTER TABLE "pregnancy_profiles" ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "pregnancy_outcome" "PregnancyOutcome";
