// Value objects
export { type ProductId, productId } from './product-id.vo';
export { type ProductCode, productCode } from './product-code.vo';
export { type ProductName, productName } from './product-name.vo';
export {
  ProductCategory,
  PRODUCT_CATEGORIES,
  productCategory,
} from './product-category.vo';
export {
  UnitKind,
  type UnitCode,
  type UnitOfMeasure,
  unitOfMeasure,
  metricBase,
} from './unit-of-measure.vo';
export { ProductStatus, checkProductTransition } from './product-status.vo';

// Errors
export {
  ProductRule,
  type ProductRule as ProductRuleType,
  ProductRuleViolation,
} from './products.errors';

// Events
export {
  ProductEventType,
  type ProductEventType as ProductEventTypeValue,
  PRODUCT_AGGREGATE,
  type ProductRegisteredPayload,
  type ProductRenamedPayload,
  type ProductAliasesChangedPayload,
  type ProductStatusChangedPayload,
} from './product.events';

// Aggregate
export {
  type RegisterProductInput,
  type ProductSnapshot,
  type ProductDependencies,
  Product,
} from './product.aggregate';

// Factory
export { type UnitInput, createProduct } from './factories/product.factory';

// Domain services
export {
  normalizeProductText,
  scoreProductMatch,
  resolveProducts,
  type ProductSummary,
  type ProductCandidate,
  type ResolveProductQuery,
} from './services';
