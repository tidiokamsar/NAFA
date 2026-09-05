-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN', 'CLOSED');

-- CreateTable
-- Cross-Master references (sellerId, productId, pickupAreaId) carry no
-- foreign keys on purpose: an offer references the other Masters by
-- identity (ADR-0011 §3); their integrity is the ports' question, never
-- the database's constraint across Master boundaries.
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityValue" DOUBLE PRECISION NOT NULL,
    "unitCode" TEXT NOT NULL,
    "priceAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "pickupAreaId" UUID,
    "availableFrom" TEXT NOT NULL,
    "availableTo" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offers_deletedAt_idx" ON "offers"("deletedAt");

-- CreateIndex — the queries of the marketplace-to-be
CREATE INDEX "offers_sellerId_idx" ON "offers"("sellerId");

CREATE INDEX "offers_productId_idx" ON "offers"("productId");

CREATE INDEX "offers_pickupAreaId_idx" ON "offers"("pickupAreaId");

CREATE INDEX "offers_status_idx" ON "offers"("status");
