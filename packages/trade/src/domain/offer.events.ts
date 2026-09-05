import type { ActorId } from '@nafa/foundation';
import type { ProductId, UnitCode } from '@nafa/products';
import type { AdministrativeAreaId } from '@nafa/geography';
import type { OfferId } from './offer-id.vo';
import type { OfferStatus } from './offer-status.vo';
import type { Money } from './money.vo';

/**
 * What the Offer aggregate announces.
 *
 * Naming: `<aggregate>.<past-tense verb>` — past tense because an event
 * reports something that has happened; a consumer cannot refuse it. The
 * prefix matches the aggregate name exactly (the ACTOR-001 M3 lesson).
 */
export const OfferEventType = {
  REGISTERED: 'offer.registered',
  PUBLISHED: 'offer.published',
  PRICE_REVISED: 'offer.price-revised',
  WITHDRAWN: 'offer.withdrawn',
  CLOSED: 'offer.closed',
} as const;

export type OfferEventType =
  (typeof OfferEventType)[keyof typeof OfferEventType];

/** Every Offer event names its aggregate the same way. */
export const OFFER_AGGREGATE = 'Offer';

export interface OfferRegisteredPayload {
  offerId: OfferId;
  sellerId: ActorId;
  productId: ProductId;
  unit: UnitCode;
  pickupAreaId: AdministrativeAreaId | null;
}

export interface OfferPriceRevisedPayload {
  offerId: OfferId;
  previousPrice: Money;
  newPrice: Money;
}

export interface OfferStatusChangedPayload {
  offerId: OfferId;
  from: OfferStatus;
  to: OfferStatus;
}
