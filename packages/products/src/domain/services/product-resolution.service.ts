import type { ProductCategory } from '../product-category.vo';
import type { ProductCode } from '../product-code.vo';
import type { ProductId } from '../product-id.vo';
import type { ProductName } from '../product-name.vo';
import type { ProductStatus } from '../product-status.vo';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A lightweight read-only view of a product for resolution. */
export interface ProductSummary {
  readonly productId: ProductId;
  readonly code: ProductCode;
  readonly category: ProductCategory;
  readonly name: ProductName;
  readonly status: ProductStatus;
}

/** A resolution candidate ranked by score (higher = better match). */
export interface ProductCandidate {
  readonly product: ProductSummary;
  /** 0–1, higher is a better match. */
  readonly score: number;
}

export interface ResolveProductQuery {
  /** Free-text input — e.g. "anacarde", "ANACARDE", "cajou", "cashew". */
  readonly query: string;
  /** Restrict to this category (optional). */
  readonly category?: ProductCategory;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises a string for comparison: trim, lower-case, NFKD-decomposed,
 * stripped of combining diacritics — so « Anacarde » and « ANACARDE »
 * collapse together.
 */
export function normalizeProductText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
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
 * - Code starts with query → 0.4
 *
 * Returns 0 (no match) when none of the above apply.
 */
export function scoreProductMatch(
  normalisedQuery: string,
  candidate: ProductSummary,
): number {
  const nameNorm = normalizeProductText(candidate.name.official);

  if (nameNorm === normalisedQuery) return 1.0;

  for (const alias of candidate.name.aliases) {
    if (normalizeProductText(alias) === normalisedQuery) return 0.95;
  }

  if (nameNorm.startsWith(normalisedQuery)) return 0.8;
  if (nameNorm.includes(normalisedQuery)) return 0.6;

  for (const alias of candidate.name.aliases) {
    const aliasNorm = normalizeProductText(alias);
    if (aliasNorm.startsWith(normalisedQuery)) return 0.5;
    if (aliasNorm.includes(normalisedQuery)) return 0.3;
  }

  if (normalizeProductText(candidate.code).startsWith(normalisedQuery)) {
    return 0.4;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Resolves a free-text query into ranked product candidates.
 *
 * **Never forces a single match.** The caller decides what to do with the
 * candidates — the same design as `AreaResolutionService` (GEO-001.5) and
 * `findPhoneNumberCollisions()` before it, for the same reason: an
 * incorrect automatic resolution would silently misfile a listing, a stock
 * line or a price.
 *
 * Pure domain service: it receives the products to search via a read-only
 * view, so it has no dependency on infrastructure.
 */
export function resolveProducts(
  products: readonly ProductSummary[],
  query: ResolveProductQuery,
): readonly ProductCandidate[] {
  const normalised = normalizeProductText(query.query);

  if (normalised.length === 0) return [];

  const candidates: ProductCandidate[] = [];

  for (const product of products) {
    if (query.category !== undefined && product.category !== query.category) {
      continue;
    }

    const score = scoreProductMatch(normalised, product);
    if (score > 0) {
      candidates.push({ product, score });
    }
  }

  // Sort by score descending, then by code for stable ordering.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return normalizeProductText(a.product.code).localeCompare(
      normalizeProductText(b.product.code),
    );
  });

  return candidates;
}
