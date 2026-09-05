import type { ActorId } from '@nafa/foundation';
import type { ProductId } from '@nafa/products';
import { OfferStatus, type OfferSnapshot } from '@nafa/trade';
import {
  offerToRow,
  offerToSnapshot,
  type OfferPrismaRow,
} from './offer.mapper';

const OFFER_ID =
  '550e8400-e29b-41d4-a716-446655440000' as OfferSnapshot['offerId'];
const SELLER = '660e8400-e29b-41d4-a716-446655440001' as ActorId;
const PRODUCT = '770e8400-e29b-41d4-a716-446655440002' as ProductId;
const AREA =
  '880e8400-e29b-41d4-a716-446655440003' as OfferSnapshot['pickupAreaId'];

function makeSnapshot(overrides: Partial<OfferSnapshot> = {}): OfferSnapshot {
  return {
    offerId: OFFER_ID,
    sellerId: SELLER,
    productId: PRODUCT,
    quantity: { value: 500, unit: 'KG' as never },
    unitPrice: { amountMinor: 12_000, currency: 'GNF' as never },
    pickupAreaId: AREA,
    window: {
      availableFrom: '2026-10-01' as never,
      availableTo: '2027-01-31' as never,
    },
    status: OfferStatus.PUBLISHED,
    version: 4,
    ...overrides,
  };
}

describe('offer mapper', () => {
  it('round-trips a full snapshot — quantity, price, window and area intact', () => {
    const snapshot = makeSnapshot();

    const row = offerToRow(snapshot);
    expect(row.id).toBe(OFFER_ID);
    expect(row.quantityValue).toBe(500);
    expect(row.unitCode).toBe('KG');
    expect(row.priceAmountMinor).toBe(12_000);
    expect(row.currency).toBe('GNF');
    expect(row.pickupAreaId).toBe(AREA);
    expect(row.availableFrom).toBe('2026-10-01');
    expect(row.availableTo).toBe('2027-01-31');

    const back = offerToSnapshot(row as unknown as OfferPrismaRow);
    expect(back).toEqual(snapshot);
  });

  it('round-trips a minimal snapshot — no area, open-ended window, decimal quantity', () => {
    const snapshot = makeSnapshot({
      pickupAreaId: null,
      window: { availableFrom: '2026-10-01' as never, availableTo: null },
      quantity: { value: 2.5, unit: 'SAC_50' as never },
      status: OfferStatus.DRAFT,
      version: 1,
    });

    const back = offerToSnapshot(
      offerToRow(snapshot) as unknown as OfferPrismaRow,
    );
    expect(back).toEqual(snapshot);
    expect(back.quantity.value).toBe(2.5);
    expect(back.window.availableTo).toBeNull();
  });
});
