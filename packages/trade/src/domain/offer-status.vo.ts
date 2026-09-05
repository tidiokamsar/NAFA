/**
 * The lifecycle of an offer.
 *
 * A seller composes DRAFT, PUBLISHES to the marketplace, and the offer ends
 * WITHDRAWN (pulled by the seller, from draft or published) or CLOSED
 * (settled — sold or expired by its window). No resurrection: relisting is
 * a new offer, and a closed offer keeps resolving for history.
 */
export enum OfferStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  WITHDRAWN = 'WITHDRAWN',
  CLOSED = 'CLOSED',
}

/**
 * Invariant 8 — the allowed transitions.
 *
 * DRAFT → PUBLISHED | WITHDRAWN ; PUBLISHED → WITHDRAWN | CLOSED. The two
 * terminal states lead nowhere.
 */
const ALLOWED: ReadonlyMap<OfferStatus, readonly OfferStatus[]> = new Map([
  [OfferStatus.DRAFT, [OfferStatus.PUBLISHED, OfferStatus.WITHDRAWN]],
  [OfferStatus.PUBLISHED, [OfferStatus.WITHDRAWN, OfferStatus.CLOSED]],
  [OfferStatus.WITHDRAWN, []],
  [OfferStatus.CLOSED, []],
]);

/** Whether a transition is allowed. Same shape as every Master before. */
export function checkOfferTransition(
  from: OfferStatus,
  to: OfferStatus,
): boolean {
  if (from === to) return false;
  return ALLOWED.get(from)?.includes(to) ?? false;
}
