/**
 * The lifecycle of a catalogue product.
 *
 * A product starts DRAFT while the reference team composes it, is
 * PUBLISHED once the marketplace may list it, and is DEPRECATED when it
 * leaves the catalogue — historical data still points at it, so it is
 * never deleted.
 */
export enum ProductStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  DEPRECATED = 'DEPRECATED',
}

/**
 * Invariant 6 — the allowed transitions.
 *
 * Strictly forward: DRAFT → PUBLISHED → DEPRECATED. No way back — a
 * deprecated product re-entering the catalogue is a new registration, not
 * a resurrection, and un-publishing a listed product would strand every
 * offer pointing at it.
 */
const ALLOWED: ReadonlyMap<ProductStatus, readonly ProductStatus[]> = new Map([
  [ProductStatus.DRAFT, [ProductStatus.PUBLISHED]],
  [ProductStatus.PUBLISHED, [ProductStatus.DEPRECATED]],
  [ProductStatus.DEPRECATED, []],
]);

/**
 * Whether a transition is allowed.
 *
 * Same shape as `checkCountryProfileTransition` and the actor status
 * machine — the third Master, the same rule.
 */
export function checkProductTransition(
  from: ProductStatus,
  to: ProductStatus,
): boolean {
  if (from === to) return false;
  return ALLOWED.get(from)?.includes(to) ?? false;
}
