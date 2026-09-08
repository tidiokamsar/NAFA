-- CreateTable
-- The transactional bridge between a write and its publication (ADR-0008).
--
-- No audit columns: this is not a business entity. It has no author, is never
-- soft-deleted, and its rows are consumed and purged rather than corrected.
-- "version" here is the aggregate's version at the event, not an optimistic
-- concurrency counter.
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregate" TEXT NOT NULL,
    -- Plain text, not UUID. Most aggregates are keyed by one, but
    -- CountryProfile is keyed by its ISO country code, and an outbox that
    -- demanded UUIDs would refuse a whole Master's events inside the very
    -- transaction that produced them.
    "aggregateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "occurredAt" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "tenantId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One event per aggregate version, enforced rather than trusted. An aggregate
-- advances its version once per event, so a repository that wrote the same
-- drained buffer twice collides here instead of duplicating it downstream.
CREATE UNIQUE INDEX "outbox_events_aggregate_aggregateId_version_key" ON "outbox_events"("aggregate", "aggregateId", "version");

-- CreateIndex — the relay's only query: the oldest unpublished rows.
CREATE INDEX "outbox_events_publishedAt_createdAt_idx" ON "outbox_events"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_aggregateId_idx" ON "outbox_events"("aggregate", "aggregateId");
