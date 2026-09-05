import type { ActorId } from '@nafa/foundation';
import type { AdministrativeAreaId } from '@nafa/geography';
import type { ProductId } from '@nafa/products';
import type { Clock, IdGenerator } from '@nafa/shared';
import { Offer } from '../offer.aggregate';
import { offerId } from '../offer-id.vo';
import { quantity } from '../quantity.vo';
import { money } from '../money.vo';
import { offerWindow } from '../offer-window.vo';
import { TradeRule, TradeRuleViolation } from '../trade.errors';
import type { ProductCatalog } from '../ports/product-catalog.port';
import type { SellerRegistry } from '../ports/seller-registry.port';

/**
 * Builds an `Offer` from plain inputs, asking the collection questions
 * first.
 *
 * Invariants 2, 3 and 5 span other Masters' collections — no aggregate can
 * answer them alone — so the factory asks the two ports before registering:
 * the seller must be active, the product must be PUBLISHED, and the unit
 * must be one the product declares. Only then does `Offer.register` run,
 * with everything structural already validated.
 *
 * Same precedent as the geography and products factories: validate the
 * value objects, then delegate — orchestration here, invariants in the
 * aggregate.
 */
export async function createOffer(
  input: {
    readonly sellerId: ActorId;
    readonly productId: ProductId;
    readonly quantityValue: number;
    readonly unitCode: string;
    readonly priceAmountMinor: number;
    readonly currency: string;
    readonly pickupAreaId: AdministrativeAreaId | null;
    readonly availableFrom: string;
    readonly availableTo?: string | null;
  },
  deps: { clock: Clock; ids: IdGenerator },
  ports: { catalog: ProductCatalog; sellers: SellerRegistry },
): Promise<
  { ok: true; value: Offer } | { ok: false; error: TradeRuleViolation }
> {
  // Invariant 2 — the seller exists and is active.
  const sellerActive = await ports.sellers.isActive(input.sellerId);
  if (!sellerActive) {
    return {
      ok: false,
      error: TradeRuleViolation.violated(
        TradeRule.SELLER_NOT_ACTIVE,
        'The seller does not exist or is not active.',
      ),
    };
  }

  // Invariant 3 — the product exists and is PUBLISHED.
  const product = await ports.catalog.getPublishedProduct(input.productId);
  if (!product) {
    return {
      ok: false,
      error: TradeRuleViolation.violated(
        TradeRule.PRODUCT_NOT_PUBLISHED,
        'The product does not exist or is not published in the catalogue.',
      ),
    };
  }

  // Value objects.
  const id = offerId(deps.ids.generate());
  if (!id.ok) return { ok: false, error: id.error };

  // Invariant 4 — quantity shape.
  const qty = quantity(input.quantityValue, input.unitCode as never);
  if (!qty.ok) return { ok: false, error: qty.error };

  // Invariant 5 — the unit is one the product declares.
  if (!product.units.includes(qty.value.unit)) {
    return {
      ok: false,
      error: TradeRuleViolation.violated(
        TradeRule.UNIT_NOT_DECLARED,
        `Unit ${qty.value.unit} is not declared by the product; use one of: ${product.units.join(', ')}.`,
      ),
    };
  }

  // Invariant 6 — price shape.
  const price = money(input.priceAmountMinor, input.currency);
  if (!price.ok) return { ok: false, error: price.error };

  // Invariant 7 — window shape and coherence.
  const window = offerWindow({
    availableFrom: input.availableFrom,
    availableTo: input.availableTo,
  });
  if (!window.ok) return { ok: false, error: window.error };

  const registered = Offer.register(
    {
      offerId: id.value,
      sellerId: input.sellerId,
      productId: input.productId,
      quantity: qty.value,
      unitPrice: price.value,
      pickupAreaId: input.pickupAreaId,
      window: window.value,
    },
    deps,
  );
  if (!registered.ok) return { ok: false, error: registered.error };

  return { ok: true, value: registered.value };
}
