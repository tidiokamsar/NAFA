-- Fix a gap in spr_geo_002_geography_tables: the schema declared
-- `countryCode @unique` but the hand-written migration never created the
-- index. Detected by Prisma drift analysis when PROD-002 touched the schema.
-- Safe on existing data: country_profiles holds at most one row per country
-- (the import pipeline upserts by countryCode).

-- CreateIndex (unique — a country has exactly one profile)
CREATE UNIQUE INDEX "country_profiles_countryCode_key" ON "country_profiles"("countryCode");
