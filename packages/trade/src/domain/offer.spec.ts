import {
  FixedClock,
  UuidGenerator,
  type Clock,
  type IdGenerator,
} from '@nafa/shared';
import type { ActorId } from '@nafa/foundation';
import type { AdministrativeAreaId } from '@nafa/geography';
import type { ProductId, UnitCode } from '@nafa/products';
import {
  money,
  offerId,
  offerWindow,
  Offer,
  OfferStatus,
  checkOfferTransition,
  quantity,
  TradeRule,
} from './index';

const NOW = new Date('2026-09-05T10:00:00.000Z');

function deps(): { clock: Clock; ids: IdGenerator } {
  return { clock: new FixedClock(NOW), ids: new UuidGenerator() };
}

/** Unwraps a Result the test expects to have succeeded. */
function expectOk<T>(
  result: { ok: boolean; value?: T; error?: { message: string } },
  label: string,
): T {
  if (!result.ok) {
    throw new Error(`expectOk(${label}): ${result.error?.message}`);
  }
  return result.value as T;
}

function expectErr(
  result: { ok: boolean; error?: { rule: string } },
  rule: string,
): void {
  expect(result.ok).toBe(false);
  expect(result.error?.rule).toBe(rule);
}

// ---------------------------------------------------------------------------
// Fixtures — one offer: 500 kg of fonio at 12 000 GNF/kg, Kindia pickup.
// ---------------------------------------------------------------------------

const OFFER_ID = '550e8400-e29b-41d4-a716-446655440000';
const SELLER = '660e8400-e29b-41d4-a716-446655440001' as ActorId;
const PRODUCT = '770e8400-e29b-41d4-a716-446655440002' as ProductId;
const AREA = '880e8400-e29b-41d4-a716-446655440003' as AdministrativeAreaId;
const KG = 'KG' as UnitCode;

function registeredOffer() {
  return expectOk(
    Offer.register(
      {
        offerId: expectOk(offerId(OFFER_ID), 'id'),
        sellerId: SELLER,
        productId: PRODUCT,
        quantity: expectOk(quantity(500, KG), 'quantity'),
        unitPrice: expectOk(money(12_000, 'gnf'), 'price'),
        pickupAreaId: AREA,
        window: expectOk(
          offerWindow({
            availableFrom: '2026-10-01',
            availableTo: '2027-01-31',
          }),
          'window',
        ),
      },
      deps(),
    ),
    'register',
  );
}

// ===========================================================================
// VOs — invariants 1, 4, 6, 7
// ===========================================================================

describe('offerId (invariant 1)', () => {
  it('accepts a UUID and canonicalises to lowercase', () => {
    expect(expectOk(offerId(OFFER_ID.toUpperCase()), 'id')).toBe(OFFER_ID);
  });

  it('rejects a non-UUID', () => {
    expectErr(offerId('offre-1'), TradeRule.INVALID_OFFER_ID);
  });
});

describe('quantity (invariant 4)', () => {
  it('accepts a positive decimal — markets trade half loads', () => {
    const q = expectOk(quantity(2.5, KG), 'q');
    expect(q.value).toBe(2.5);
  });

  it('refuses zero, negative, infinite and NaN', () => {
    expectErr(quantity(0, KG), TradeRule.INVALID_QUANTITY);
    expectErr(quantity(-1, KG), TradeRule.INVALID_QUANTITY);
    expectErr(
      quantity(Number.POSITIVE_INFINITY, KG),
      TradeRule.INVALID_QUANTITY,
    );
    expectErr(quantity(Number.NaN, KG), TradeRule.INVALID_QUANTITY);
  });
});

describe('money (invariant 6)', () => {
  it('accepts a positive integer of minor units, uppercasing the currency', () => {
    const m = expectOk(money(12_000, 'gnf'), 'm');
    expect(m).toEqual({ amountMinor: 12_000, currency: 'GNF' });
  });

  it('refuses zero, negative, non-integer amounts and bad currency codes', () => {
    expectErr(money(0, 'GNF'), TradeRule.INVALID_PRICE);
    expectErr(money(-5, 'GNF'), TradeRule.INVALID_PRICE);
    expectErr(money(12.5, 'GNF'), TradeRule.INVALID_PRICE);
    expectErr(money(100, 'franc'), TradeRule.INVALID_PRICE);
  });
});

describe('offerWindow (invariant 7)', () => {
  it('accepts a coherent window, open-ended allowed', () => {
    const w = expectOk(
      offerWindow({ availableFrom: '2026-10-01', availableTo: null }),
      'w',
    );
    expect(w.availableTo).toBeNull();
  });

  it('refuses a malformed date and an inverted window', () => {
    expectErr(
      offerWindow({ availableFrom: '2026-13-01' }),
      TradeRule.INVALID_WINDOW,
    );
    expectErr(
      offerWindow({ availableFrom: '2026-10-01', availableTo: '2026-09-01' }),
      TradeRule.INVALID_WINDOW,
    );
  });
});

// ===========================================================================
// Status machine — invariant 8
// ===========================================================================

describe('checkOfferTransition (invariant 8)', () => {
  it('allows the forward paths', () => {
    expect(checkOfferTransition(OfferStatus.DRAFT, OfferStatus.PUBLISHED)).toBe(
      true,
    );
    expect(checkOfferTransition(OfferStatus.DRAFT, OfferStatus.WITHDRAWN)).toBe(
      true,
    );
    expect(
      checkOfferTransition(OfferStatus.PUBLISHED, OfferStatus.WITHDRAWN),
    ).toBe(true);
    expect(
      checkOfferTransition(OfferStatus.PUBLISHED, OfferStatus.CLOSED),
    ).toBe(true);
  });

  it('refuses every other step', () => {
    expect(checkOfferTransition(OfferStatus.DRAFT, OfferStatus.CLOSED)).toBe(
      false,
    );
    expect(checkOfferTransition(OfferStatus.PUBLISHED, OfferStatus.DRAFT)).toBe(
      false,
    );
    expect(
      checkOfferTransition(OfferStatus.WITHDRAWN, OfferStatus.PUBLISHED),
    ).toBe(false);
    expect(
      checkOfferTransition(OfferStatus.CLOSED, OfferStatus.PUBLISHED),
    ).toBe(false);
    expect(checkOfferTransition(OfferStatus.DRAFT, OfferStatus.DRAFT)).toBe(
      false,
    );
  });
});

// ===========================================================================
// Aggregate — register, snapshot, lifecycle
// ===========================================================================

describe('Offer.register', () => {
  it('registers a DRAFT offer with one registered event', () => {
    const offer = registeredOffer();
    expect(offer.status).toBe(OfferStatus.DRAFT);
    expect(offer.seller).toBe(SELLER);
    expect(offer.product).toBe(PRODUCT);
    expect(offer.offeredQuantity.value).toBe(500);
    expect(offer.area).toBe(AREA);

    const events = offer.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('offer.registered');
    expect(events[0].aggregate).toBe('Offer');
    expect(events[0].version).toBe(1);
  });
});

describe('snapshot / rehydrate', () => {
  it('round-trips without events and preserves expectedVersion', () => {
    const offer = registeredOffer();
    offer.pullEvents();

    const snapshot = offer.snapshot();
    const revived = Offer.rehydrate(snapshot, deps());
    expect(revived.snapshot()).toEqual(snapshot);
    expect(revived.pullEvents()).toHaveLength(0);
    expect(revived.expectedVersion).toBe(1);
  });
});

describe('Offer lifecycle', () => {
  it('publishes then closes, one event per step, versions advancing', () => {
    const offer = registeredOffer();
    offer.pullEvents();

    expectOk(offer.publish(deps()), 'publish');
    expectOk(offer.close(deps()), 'close');
    expect(offer.status).toBe(OfferStatus.CLOSED);

    const events = offer.pullEvents();
    expect(events.map((e) => e.eventType)).toEqual([
      'offer.published',
      'offer.closed',
    ]);
    expect(events.map((e) => e.version)).toEqual([2, 3]);
    expect(offer.version).toBe(3);
    expect(offer.expectedVersion).toBe(0);
  });

  it('withdraws straight from DRAFT — cancelling before listing', () => {
    const offer = registeredOffer();
    expectOk(offer.withdraw(deps()), 'withdraw');
    expect(offer.status).toBe(OfferStatus.WITHDRAWN);
  });

  it('refuses DRAFT → CLOSED (invariant 8)', () => {
    const offer = registeredOffer();
    expectErr(offer.close(deps()), TradeRule.INVALID_STATUS_TRANSITION);
  });

  it('refuses un-publishing (invariant 8)', () => {
    const offer = registeredOffer();
    expectOk(offer.publish(deps()), 'publish');
    expectErr(offer.publish(deps()), TradeRule.INVALID_STATUS_TRANSITION);
  });
});

describe('Offer.revisePrice', () => {
  it('revises while PUBLISHED, tracing both prices', () => {
    const offer = registeredOffer();
    expectOk(offer.publish(deps()), 'publish');
    offer.pullEvents();

    const next = expectOk(money(13_500, 'GNF'), 'next');
    expectOk(offer.revisePrice(next, deps()), 'revise');

    const events = offer.pullEvents();
    expect(events[0].eventType).toBe('offer.price-revised');
    expect(offer.unitPrice.amountMinor).toBe(13_500);
  });

  it('refuses revising a DRAFT offer — nothing is listed yet', () => {
    const offer = registeredOffer();
    const next = expectOk(money(9_000, 'GNF'), 'next');
    expectErr(offer.revisePrice(next, deps()), TradeRule.OFFER_NOT_PUBLISHED);
  });

  it('refuses a no-op revision', () => {
    const offer = registeredOffer();
    expectOk(offer.publish(deps()), 'publish');
    const same = expectOk(money(12_000, 'GNF'), 'same');
    expectErr(offer.revisePrice(same, deps()), TradeRule.INVALID_PRICE);
  });
});

describe('immutability guards (invariants 9-10)', () => {
  it('freezes every mutation once terminated (invariant 10)', () => {
    const offer = registeredOffer();
    expectOk(offer.publish(deps()), 'publish');
    expectOk(offer.withdraw(deps()), 'withdraw');

    const next = expectOk(money(9_000, 'GNF'), 'next');
    expectErr(offer.revisePrice(next, deps()), TradeRule.OFFER_TERMINATED);
    expectErr(offer.publish(deps()), TradeRule.INVALID_STATUS_TRANSITION);
    expectErr(offer.close(deps()), TradeRule.INVALID_STATUS_TRANSITION);
  });

  it('exposes identity read-only — the API offers no way to change seller, product, unit or area (invariant 9)', () => {
    const offer = registeredOffer();
    const snapshot = offer.snapshot();
    expect(snapshot.sellerId).toBe(SELLER);
    expect(snapshot.productId).toBe(PRODUCT);
    expect(snapshot.quantity.unit).toBe(KG);
    expect(snapshot.pickupAreaId).toBe(AREA);
    // The aggregate's mutations are publish/withdraw/close/revisePrice —
    // none touches identity; this test pins that the getters return the
    // registered values after a price revision too.
    expectOk(offer.publish(deps()), 'publish');
    expectOk(
      offer.revisePrice(expectOk(money(1, 'GNF'), 'p'), deps()),
      'revise',
    );
    const after = offer.snapshot();
    expect(after.sellerId).toBe(SELLER);
    expect(after.productId).toBe(PRODUCT);
    expect(after.quantity).toEqual(snapshot.quantity);
    expect(after.pickupAreaId).toBe(AREA);
  });

  it('returns a defensive copy of the quantity', () => {
    const offer = registeredOffer();
    const q = offer.offeredQuantity as { value: number };
    q.value = 1;
    expect(offer.offeredQuantity.value).toBe(500);
  });
});
