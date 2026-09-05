import type { AdministrativeAreaId } from '../administrative-area-id.vo';
import type { AreaCode } from '../area-code.vo';
import type { AreaName } from '../area-name.vo';
import type { CountryCode } from '../../../country-profile/domain/country-code.vo';
import type { AdministrativeLevel } from '../../../country-profile/domain/administrative-level.vo';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A lightweight read-only view of an administrative area for resolution. */
export interface AreaSummary {
  readonly areaId: AdministrativeAreaId;
  readonly countryCode: CountryCode;
  readonly level: AdministrativeLevel;
  readonly code: AreaCode;
  readonly name: AreaName;
}

/** A resolution candidate ranked by score (higher = better match). */
export interface AreaCandidate {
  readonly area: AreaSummary;
  /** 0–1, higher is a better match. */
  readonly score: number;
}

export interface ResolveAreaQuery {
  /** Free-text input — e.g. "Kindia", "kindia", "Kindya". */
  readonly query: string;
  /** Restrict to this country (optional). */
  readonly countryCode?: CountryCode;
  /** Restrict to this level (optional). */
  readonly level?: AdministrativeLevel;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises a string for comparison: lower-case, NFKD-decomposed, stripped of
 * combining diacritics.
 *
 * "Kindia" → "kindia"
 * "Kindya" → "kindya"
 * "KINDIA" → "kindia"
 * "Conakry" → "conakry"
 */
export function normalizeAreaText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, ''); // strip combining diacritics
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Scores how well `candidate` matches `normalisedQuery`.
 *
 * Scoring rules:
 * - Exact match on official name → 1.0
 * - Exact match on an alias → 0.95
 * - Official name starts with query → 0.8
 * - Official name contains query → 0.6
 * - Any alias starts with query → 0.5
 * - Any alias contains query → 0.3
 * - Code starts with query (case-insensitive) → 0.4
 *
 * Returns 0 (no match) when none of the above apply.
 */
export function scoreAreaMatch(
  normalisedQuery: string,
  candidate: AreaSummary,
): number {
  const nameNorm = normalizeAreaText(candidate.name.official);

  // Exact match on official name
  if (nameNorm === normalisedQuery) return 1.0;

  // Check aliases
  for (const alias of candidate.name.aliases) {
    if (normalizeAreaText(alias) === normalisedQuery) return 0.95;
  }

  // Starts with / contains on official name
  if (nameNorm.startsWith(normalisedQuery)) return 0.8;
  if (nameNorm.includes(normalisedQuery)) return 0.6;

  // Starts with / contains on aliases
  for (const alias of candidate.name.aliases) {
    const aliasNorm = normalizeAreaText(alias);
    if (aliasNorm.startsWith(normalisedQuery)) return 0.5;
    if (aliasNorm.includes(normalisedQuery)) return 0.3;
  }

  // Code match (case-insensitive, normalised)
  const codeNorm = normalizeAreaText(candidate.code);
  if (codeNorm.startsWith(normalisedQuery)) return 0.4;

  return 0;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Resolves a free-text query into ranked administrative area candidates.
 *
 * **Never forces a single match.**  The caller decides what to do with the
 * candidates — this is the same design as `findPhoneNumberCollisions()` in
 * ACTOR-001, for the same reason: an incorrect automatic resolution would
 * silently relocate an actor.
 *
 * This is a pure domain service: it receives the areas to search (via a
 * read-only view), so it has no dependency on infrastructure.
 */
export function resolveAreas(
  areas: readonly AreaSummary[],
  query: ResolveAreaQuery,
): readonly AreaCandidate[] {
  const normalised = normalizeAreaText(query.query);

  if (normalised.length === 0) return [];

  const candidates: AreaCandidate[] = [];

  for (const area of areas) {
    // Apply optional filters
    if (
      query.countryCode !== undefined &&
      area.countryCode !== query.countryCode
    ) {
      continue;
    }
    if (query.level !== undefined && area.level !== query.level) {
      continue;
    }

    const score = scoreAreaMatch(normalised, area);
    if (score > 0) {
      candidates.push({ area, score });
    }
  }

  // Sort by score descending, then by code for stable ordering
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return normalizeAreaText(a.area.code).localeCompare(
      normalizeAreaText(b.area.code),
    );
  });

  return candidates;
}
