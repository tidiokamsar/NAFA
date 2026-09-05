import type { ActorId } from '@nafa/foundation';
import type { AdministrativeAreaId } from '@nafa/geography';
import type { ProductId } from '@nafa/products';
import {
  buildDomainEvent,
  type Clock,
  type DomainEvent,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@nafa/shared';
import type { Money } from './money.vo';
import type { OfferId } from './offer-id.vo';
import { checkOfferTransition, OfferStatus } from './offer-status.vo';
import type { OfferWindow } from './offer-window.vo';
import type { Quantity } from './quantity.vo';
import { TradeRule, TradeRuleViolation } from './trade.errors';
import {
  OfferEventType,
  OFFER_AGGREGATE,
  type OfferPriceRevisedPayload,
  type OfferRegisteredPayload,
  type OfferStatusChangedPayload,
} from './offer.events';

/** What a use case hands to `Offer.register`. */
export interface RegisterOfferInput {
  readonly offerId: OfferId;
  readonly sellerId: ActorId;
  readonly productId: ProductId;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly pickupAreaId: AdministrativeAreaId | null;
  readonly window: OfferWindow;
}

/** The persisted shape a repository hands back. */
export interface OfferSnapshot {
  readonly offerId: OfferId;
  readonly sellerId: ActorId;
  readonly productId: ProductId;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly pickupAreaId: AdministrativeAreaId | null;
  readonly window: OfferWindow;
  readonly status: OfferStatus;
  readonly version: number;
}

export interface OfferDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * An offer — the first business process of the platform (ADR-0011).
 *
 * A seller proposes a quantity of a product at a unit price, available over
 * a window, optionally located. Not an order, not a transaction, not a
 * cotation.
 *
 * Invariants (10, numbered for the backlog and the tests):
 *  1. OfferId is a valid UUID                          (VO)
 *  2. The seller exists and is active                   (port — collection)
 *  3. The product exists and is PUBLISHED               (port — collection)
 *  4. Quantity is strictly positive and finite          (VO)
 *  5. The unit is one the product declares              (port — collection)
 *  6. Unit price is valid                               (VO)
 *  7. The availability window is coherent               (VO)
 *  8. Status transitions are valid                      (checked here)
 *  9. Identity is immutable — seller, product, unit,
 *     quantity and area never change after registration (by construction:
 *     no mutation touches them; tests pin the API surface)
 * 10. WITHDRAWN and CLOSED freeze everything            (checked here)
 *
 * Invariants 2, 3 and 5 span other Masters' collections: the factory asks
 * the SellerRegistry and ProductCatalog ports before registering — the
 * aggregate itself cannot see beyond its own boundary.
 */
export class Offer {
  private readonly pending: DomainEvent[] = [];
  /** Where the aggregate was loaded at — what `save` expects. */
  private readonly loadedVersion: number;
  /** Absolute version — advances with every applied event, drained or not. */
  private currentVersion: number;

  private constructor(
    readonly offerId: OfferId,
    private readonly sellerId: ActorId,
    private readonly productId: ProductId,
    private readonly quantity: Quantity,
    private currentUnitPrice: Money,
    private readonly pickupAreaId: AdministrativeAreaId | null,
    private readonly window: OfferWindow,
    private currentStatus: OfferStatus,
    loadedVersion: number,
    currentVersion: number,
  ) {
    this.loadedVersion = loadedVersion;
    this.currentVersion = currentVersion;
  }

  // ------------------------------------------------------------ factory

  /**
   * Registers a new DRAFT offer. The caller (the factory) has already
   * answered the collection questions — active seller, published product,
   * declared unit — so registration is purely structural.
   */
  static register(
    input: RegisterOfferInput,
    deps: OfferDependencies,
  ): Result<Offer, TradeRuleViolation> {
    const offer = new Offer(
      input.offerId,
      input.sellerId,
      input.productId,
      input.quantity,
      input.unitPrice,
      input.pickupAreaId,
      input.window,
      OfferStatus.DRAFT,
      0, // never stored — the first save is an insert (expectedVersion 0)
      0, // the registered event below moves it to 1
    );

    offer.emit(
      OfferEventType.REGISTERED,
      {
        offerId: input.offerId,
        sellerId: input.sellerId,
        productId: input.productId,
        unit: input.quantity.unit,
        pickupAreaId: input.pickupAreaId,
      } satisfies OfferRegisteredPayload,
      deps,
    );

    return ok(offer);
  }

  /** Rebuilds an aggregate from storage. No events, no re-validation. */
  static rehydrate(snapshot: OfferSnapshot, deps: OfferDependencies): Offer {
    void deps; // kept for signature parity — rehydration emits nothing
    return new Offer(
      snapshot.offerId,
      snapshot.sellerId,
      snapshot.productId,
      snapshot.quantity,
      snapshot.unitPrice,
      snapshot.pickupAreaId,
      snapshot.window,
      snapshot.status,
      snapshot.version,
      snapshot.version,
    );
  }

  // --------------------------------------------------------- accessors

  get seller(): ActorId {
    return this.sellerId;
  }

  get product(): ProductId {
    return this.productId;
  }

  get offeredQuantity(): Quantity {
    return { ...this.quantity };
  }

  get unitPrice(): Money {
    return this.currentUnitPrice;
  }

  get area(): AdministrativeAreaId | null {
    return this.pickupAreaId;
  }

  get availability(): OfferWindow {
    return this.window;
  }

  get status(): OfferStatus {
    return this.currentStatus;
  }

  get version(): number {
    return this.currentVersion;
  }

  /** The version to pass to `save` — where the aggregate was loaded at. */
  get expectedVersion(): number {
    return this.loadedVersion;
  }

  snapshot(): OfferSnapshot {
    return {
      offerId: this.offerId,
      sellerId: this.sellerId,
      productId: this.productId,
      quantity: { ...this.quantity },
      unitPrice: this.currentUnitPrice,
      pickupAreaId: this.pickupAreaId,
      window: this.window,
      status: this.currentStatus,
      version: this.version,
    };
  }

  /** Drains the event buffer — the outbox boundary (ADR-0008). */
  pullEvents(): readonly DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  // ---------------------------------------------------------- mutations

  /**
   * Lists the offer on the marketplace. One-way: offers are composed once.
   */
  publish(deps: OfferDependencies): Result<void, TradeRuleViolation> {
    return this.transition(OfferStatus.PUBLISHED, deps);
  }

  /**
   * Pulls the offer — from DRAFT (cancel before listing) or PUBLISHED
   * (the goods are gone, the seller changed their mind). Terminal.
   */
  withdraw(deps: OfferDependencies): Result<void, TradeRuleViolation> {
    return this.transition(OfferStatus.WITHDRAWN, deps);
  }

  /**
   * Settles the offer — sold out or expired by its window. Terminal.
   */
  close(deps: OfferDependencies): Result<void, TradeRuleViolation> {
    return this.transition(OfferStatus.CLOSED, deps);
  }

  /**
   * Revises the asking price. Allowed only while PUBLISHED — markets
   * negotiate — and traced by an event carrying both prices.
   *
   * Invariant 6 rides along: the new price passes the same VO validation.
   */
  revisePrice(
    next: Money,
    deps: OfferDependencies,
  ): Result<void, TradeRuleViolation> {
    const guard = this.ensureMutable('revisePrice');
    if (!guard.ok) return guard;

    if (this.currentStatus !== OfferStatus.PUBLISHED) {
      return err(
        TradeRuleViolation.violated(
          TradeRule.OFFER_NOT_PUBLISHED,
          'Only a PUBLISHED offer can have its price revised.',
        ),
      );
    }

    if (
      next.amountMinor === this.currentUnitPrice.amountMinor &&
      next.currency === this.currentUnitPrice.currency
    ) {
      return err(
        TradeRuleViolation.violated(
          TradeRule.INVALID_PRICE,
          'The price is unchanged.',
        ),
      );
    }

    const previous = this.currentUnitPrice;
    this.currentUnitPrice = next;
    this.emit(
      OfferEventType.PRICE_REVISED,
      {
        offerId: this.offerId,
        previousPrice: previous,
        newPrice: next,
      } satisfies OfferPriceRevisedPayload,
      deps,
    );
    return ok(undefined);
  }

  // ------------------------------------------------------------ private

  /** Invariant 8 — one legal step through the status machine. */
  private transition(
    to: OfferStatus,
    deps: OfferDependencies,
  ): Result<void, TradeRuleViolation> {
    const from = this.currentStatus;

    if (!checkOfferTransition(from, to)) {
      return err(
        TradeRuleViolation.transition(
          TradeRule.INVALID_STATUS_TRANSITION,
          `Cannot transition a ${from} offer to ${to}.`,
        ),
      );
    }

    this.currentStatus = to;
    this.emit(
      to === OfferStatus.PUBLISHED
        ? OfferEventType.PUBLISHED
        : to === OfferStatus.WITHDRAWN
          ? OfferEventType.WITHDRAWN
          : OfferEventType.CLOSED,
      { offerId: this.offerId, from, to } satisfies OfferStatusChangedPayload,
      deps,
    );
    return ok(undefined);
  }

  /**
   * Invariant 10 — a terminated offer is frozen. Every mutation funnels
   * through this guard first.
   */
  private ensureMutable(operation: string): Result<void, TradeRuleViolation> {
    if (
      this.currentStatus === OfferStatus.WITHDRAWN ||
      this.currentStatus === OfferStatus.CLOSED
    ) {
      return err(
        TradeRuleViolation.transition(
          TradeRule.OFFER_TERMINATED,
          `A ${this.currentStatus} offer cannot be modified ("${operation}").`,
        ),
      );
    }
    return ok(undefined);
  }

  /**
   * Emits an event at the version the aggregate will hold once it is
   * applied — the convention shared by every Master.
   */
  private emit(
    eventType: string,
    payload: Record<string, unknown>,
    deps: OfferDependencies,
  ): void {
    this.currentVersion += 1;
    this.pending.push(
      buildDomainEvent(
        {
          eventType,
          aggregate: OFFER_AGGREGATE,
          aggregateId: this.offerId,
          version: this.currentVersion,
          occurredAt: deps.clock.nowIso(),
          payload,
        },
        deps.ids.generate,
      ),
    );
  }
}
