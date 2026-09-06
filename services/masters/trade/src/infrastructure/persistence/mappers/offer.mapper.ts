import type { OfferSnapshot } from '@nafa/trade';

/** The structural subset of a Prisma row the mapper reads. */
export interface OfferPrismaRow {
  readonly id: string;
  readonly sellerId: string;
  readonly productId: string;
  readonly quantityValue: number;
  readonly unitCode: string;
  readonly priceAmountMinor: number;
  readonly currency: string;
  readonly pickupAreaId: string | null;
  readonly availableFrom: string;
  readonly availableTo: string | null;
  readonly status: string;
  readonly version: number;
}

/**
 * Maps between the domain snapshot and the persistence row.
 *
 * The snapshot nests value objects (Quantity, Money, OfferWindow); the row
 * flattens them across columns. Brand types (OfferId, ActorId, ProductId,
 * UnitCode, Currency, IsoDate) are plain strings here — validated when the
 * value objects were built, cast back on the way in.
 */
export function offerToRow(snapshot: OfferSnapshot): {
  id: string;
  sellerId: string;
  productId: string;
  quantityValue: number;
  unitCode: string;
  priceAmountMinor: number;
  currency: string;
  pickupAreaId: string | null;
  availableFrom: string;
  availableTo: string | null;
  status: string;
  version: number;
} {
  return {
    id: snapshot.offerId,
    sellerId: snapshot.sellerId,
    productId: snapshot.productId,
    quantityValue: snapshot.quantity.value,
    unitCode: snapshot.quantity.unit,
    priceAmountMinor: snapshot.unitPrice.amountMinor,
    currency: snapshot.unitPrice.currency,
    pickupAreaId: snapshot.pickupAreaId,
    availableFrom: snapshot.window.availableFrom,
    availableTo: snapshot.window.availableTo,
    status: snapshot.status,
    version: snapshot.version,
  };
}

export function offerToSnapshot(row: OfferPrismaRow): OfferSnapshot {
  return {
    offerId: row.id as OfferSnapshot['offerId'],
    sellerId: row.sellerId as OfferSnapshot['sellerId'],
    productId: row.productId as OfferSnapshot['productId'],
    quantity: {
      value: row.quantityValue,
      unit: row.unitCode as OfferSnapshot['quantity']['unit'],
    },
    unitPrice: {
      amountMinor: row.priceAmountMinor,
      currency: row.currency as OfferSnapshot['unitPrice']['currency'],
    },
    pickupAreaId: row.pickupAreaId as OfferSnapshot['pickupAreaId'],
    window: {
      availableFrom:
        row.availableFrom as OfferSnapshot['window']['availableFrom'],
      availableTo: row.availableTo as OfferSnapshot['window']['availableTo'],
    },
    status: row.status as OfferSnapshot['status'],
    version: row.version,
  };
}
