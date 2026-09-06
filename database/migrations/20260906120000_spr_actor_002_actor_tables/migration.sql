-- CreateEnum
CREATE TYPE "ActorNature" AS ENUM ('PERSON', 'COMPANY', 'COOPERATIVE');

-- CreateEnum
CREATE TYPE "ActorStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('NONE', 'BASIC', 'ENHANCED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'RESIGNED', 'EXCLUDED');

-- CreateTable
-- identity, address, contacts and roles are JSONB: they sit inside the
-- aggregate's transactional boundary and are never read without the actor
-- they belong to. rccm, nif and phoneNumbers are a projection of that JSON,
-- written by the mapper on every save so the database can answer the three
-- uniqueness questions no aggregate can answer about itself.
CREATE TABLE "actors" (
    "id" UUID NOT NULL,
    "nature" "ActorNature" NOT NULL,
    "identity" JSONB NOT NULL,
    "address" JSONB NOT NULL,
    "contacts" JSONB NOT NULL,
    "roles" JSONB NOT NULL,
    "status" "ActorStatus" NOT NULL DEFAULT 'DRAFT',
    "verification" "VerificationLevel" NOT NULL DEFAULT 'NONE',
    "rccm" TEXT,
    "nif" TEXT,
    "phoneNumbers" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "actors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- cooperativeId and memberId reference rows in "actors" but carry no foreign
-- key: CooperativeMembership is its own aggregate and holds ActorIds, never
-- Actors (ADR-0006). The real constraint — at most one ACTIVE membership per
-- pair — is not expressible as a unique index and lives in the domain.
CREATE TABLE "cooperative_memberships" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "admittedAt" TEXT NOT NULL,
    "endedAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cooperative_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the database-level backstop behind ActorUniquenessChecker.
-- NULLs do not collide in Postgres, so a person without a NIF is fine.
CREATE UNIQUE INDEX "actors_rccm_key" ON "actors"("rccm");

CREATE UNIQUE INDEX "actors_nif_key" ON "actors"("nif");

-- CreateIndex
CREATE INDEX "actors_deletedAt_idx" ON "actors"("deletedAt");

CREATE INDEX "actors_status_idx" ON "actors"("status");

CREATE INDEX "actors_nature_idx" ON "actors"("nature");

-- CreateIndex — GIN, because the lookup is "which actors carry this number",
-- a containment test over the array rather than an equality on a column.
CREATE INDEX "actors_phoneNumbers_idx" ON "actors" USING GIN ("phoneNumbers");

-- CreateIndex
CREATE INDEX "cooperative_memberships_deletedAt_idx" ON "cooperative_memberships"("deletedAt");

-- CreateIndex — serves findActiveBetween and listByCooperative, which reads
-- the leading column alone.
CREATE INDEX "cooperative_memberships_cooperativeId_memberId_idx" ON "cooperative_memberships"("cooperativeId", "memberId");

-- CreateIndex
CREATE INDEX "cooperative_memberships_memberId_idx" ON "cooperative_memberships"("memberId");

CREATE INDEX "cooperative_memberships_status_idx" ON "cooperative_memberships"("status");
