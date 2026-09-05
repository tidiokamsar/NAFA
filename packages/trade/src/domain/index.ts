// Value objects
export { type OfferId, offerId } from './offer-id.vo';
export { type Quantity, quantity } from './quantity.vo';
export { type Currency, type Money, money } from './money.vo';
export { type OfferWindow, offerWindow } from './offer-window.vo';
export { OfferStatus, checkOfferTransition } from './offer-status.vo';

// Errors
export {
  TradeRule,
  type TradeRule as TradeRuleType,
  TradeRuleViolation,
} from './trade.errors';

// Events
export {
  OfferEventType,
  type OfferEventType as OfferEventTypeValue,
  OFFER_AGGREGATE,
  type OfferRegisteredPayload,
  type OfferPriceRevisedPayload,
  type OfferStatusChangedPayload,
} from './offer.events';

// Aggregate
export {
  type RegisterOfferInput,
  type OfferSnapshot,
  type OfferDependencies,
  Offer,
} from './offer.aggregate';
