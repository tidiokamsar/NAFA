-- CreateEnum
CREATE TYPE "CountryProfileStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "AreaStatus" AS ENUM ('ACTIVE', 'MERGED', 'SPLIT', 'DISSOLVED');

-- CreateEnum
CREATE TYPE "AdministrativeLevel" AS ENUM ('COUNTRY', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4');

-- CreateTable
CREATE TABLE "country_profiles" (
    "id" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "status" "CountryProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "levels" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "country_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_areas" (
    "id" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "level" "AdministrativeLevel" NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "parentId" UUID,
    "centroid" JSONB,
    "validFrom" TEXT,
    "validTo" TEXT,
    "status" "AreaStatus" NOT NULL DEFAULT 'ACTIVE',
    "successors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "administrative_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique — invariant 13: AreaCode unique per country+level)
CREATE UNIQUE INDEX "administrative_areas_countryCode_level_code_key" ON "administrative_areas"("countryCode", "level", "code");

-- CreateIndex
CREATE INDEX "country_profiles_deletedAt_idx" ON "country_profiles"("deletedAt");

-- CreateIndex
CREATE INDEX "country_profiles_status_idx" ON "country_profiles"("status");

-- CreateIndex
CREATE INDEX "administrative_areas_deletedAt_idx" ON "administrative_areas"("deletedAt");

-- CreateIndex
CREATE INDEX "administrative_areas_countryCode_parentId_idx" ON "administrative_areas"("countryCode", "parentId");

-- CreateIndex
CREATE INDEX "administrative_areas_countryCode_level_idx" ON "administrative_areas"("countryCode", "level");

-- AddForeignKey (self-reference — parent area)
ALTER TABLE "administrative_areas" ADD CONSTRAINT "administrative_areas_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "administrative_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
