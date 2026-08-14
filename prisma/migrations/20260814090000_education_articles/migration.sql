-- CreateEnum
CREATE TYPE "EducationTrimester" AS ENUM ('trimester_1', 'trimester_2', 'trimester_3');

-- CreateTable
CREATE TABLE "education_articles" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "trimester" "EducationTrimester",
    "category" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "education_articles_slug_key" ON "education_articles"("slug");

-- CreateIndex
CREATE INDEX "education_articles_published_trimester_category_idx" ON "education_articles"("published", "trimester", "category");

-- CreateIndex
CREATE INDEX "education_articles_published_created_at_idx" ON "education_articles"("published", "created_at");