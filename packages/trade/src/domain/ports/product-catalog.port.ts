import type { ProductId, UnitCode } from '@nafa/products';
import type { Result } from '@nafa/shared';
import type { TradeRuleViolation } from '../trade.errors';

/** What the trade domain needs to know about a published product. */
export interface PublishedProduct {
  readonly productId: ProductId;
  /** The units the product declares — invariant 5 checks against these. */
  readonly units: readonly UnitCode[];
}

/**
 * The Products Master, as the trade domain sees it.
 *
 * Cross-Master by design (ADR-0011 §3): trade imports the brand types but
 * never the Product aggregate — existence and published-ness are questions
 * about the products collection, asked through this port. The adapter side
 * decides whether that means a database read, a service call or a cached
 * projection.
 */
export interface ProductCatalog {
  /**
   * The published product, or null when it does not exist or is not
   * PUBLISHED (both are invariant 3's refusal — the caller cannot act on
   * either).
   */
  getPublishedProduct(productId: ProductId): Promise<PublishedProduct | null>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const PRODUCT_CATALOG = Symbol('PRODUCT_CATALOG');

// Re-exported for the factory's error surface — kept next to the port so
// the collection questions live together.
export type CatalogCheck = Result<void, TradeRuleViolation>;
