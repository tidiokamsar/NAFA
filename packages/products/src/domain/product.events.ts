import type { ProductCategory } from './product-category.vo';
import type { ProductCode } from './product-code.vo';
import type { ProductId } from './product-id.vo';
import type { ProductName } from './product-name.vo';
import type { ProductStatus } from './product-status.vo';
import type { UnitOfMeasure } from './unit-of-measure.vo';

/**
 * What the Product aggregate announces.
 *
 * Naming: `<aggregate>.<past-tense verb>` — past tense because an event
 * reports something that has happened; a consumer cannot refuse it.
 * The prefix matches the aggregate name exactly (the M3 lesson from the
 * ACTOR-001 review: `cooperative-membership.*`, not `membership.*`).
 */
export const ProductEventType = {
  REGISTERED: 'product.registered',
  RENAMED: 'product.renamed',
  ALIASES_CHANGED: 'product.aliases-changed',
  PUBLISHED: 'product.published',
  DEPRECATED: 'product.deprecated',
} as const;

export type ProductEventType =
  (typeof ProductEventType)[keyof typeof ProductEventType];

/** Every Product event names its aggregate the same way. */
export const PRODUCT_AGGREGATE = 'Product';

export interface ProductRegisteredPayload {
  productId: ProductId;
  code: ProductCode;
  category: ProductCategory;
  name: ProductName;
  units: readonly UnitOfMeasure[];
}

export interface ProductRenamedPayload {
  productId: ProductId;
  previousName: ProductName;
  newName: ProductName;
}

export interface ProductAliasesChangedPayload {
  productId: ProductId;
  previousAliases: readonly string[];
  newAliases: readonly string[];
}

export interface ProductStatusChangedPayload {
  productId: ProductId;
  from: ProductStatus;
  to: ProductStatus;
}
