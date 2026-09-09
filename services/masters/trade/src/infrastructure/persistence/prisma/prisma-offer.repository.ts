import { Injectable } from '@nestjs/common';
// `Clock` and `IdGenerator` are imported as VALUES, not types. They are
// abstract classes used as DI tokens, and a `type` import is erased at
// compile time — `emitDecoratorMetadata` then records `Function` instead of
// the class, and Nest has no token to resolve. The service still typechecks,
// still builds, and fails only when something actually boots the module.
// Nothing did until the first HTTP e2e (ADR-0014 §4).
import { Clock, IdGenerator, StaleVersionError } from '@nafa/shared';
import { appendToOutbox } from '@nafa/platform';
import { Offer, type OfferRepository } from '@nafa/trade';
import { PrismaService } from './prisma.service';
import {
  offerToRow,
  offerToSnapshot,
  type OfferPrismaRow,
} from '../mappers/offer.mapper';

/**
 * Prisma adapter for the OfferRepository port.
 *
 * Same optimistic-concurrency contract as every repository before it:
 * `save` compares `expectedVersion` in the WHERE clause and raises
 * `StaleVersionError` when the stored row moved; 0 means insert.
 *
 * sellerId, productId and pickupAreaId are stored as plain UUIDs with no
 * foreign keys — cross-Master integrity is the ports' question
 * (ADR-0011 §3), never a database constraint across Master boundaries.
 */
@Injectable()
export class PrismaOfferRepository implements OfferRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: string): Promise<Offer | null> {
    const row = await this.prisma.offer.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  async findBySeller(sellerId: string): Promise<readonly Offer[]> {
    const rows = await this.prisma.offer.findMany({
      where: { sellerId, deletedAt: null },
    });
    return rows.map((r) => this.rehydrate(r));
  }

  async findByProduct(productId: string): Promise<readonly Offer[]> {
    const rows = await this.prisma.offer.findMany({
      where: { productId, deletedAt: null },
    });
    return rows.map((r) => this.rehydrate(r));
  }

  async findByPickupArea(areaId: string): Promise<readonly Offer[]> {
    const rows = await this.prisma.offer.findMany({
      where: { pickupAreaId: areaId, deletedAt: null },
    });
    return rows.map((r) => this.rehydrate(r));
  }

  async save(offer: Offer, expectedVersion: number): Promise<void> {
    const row = offerToRow(offer.snapshot());
    // Drained before the transaction opens, and once. `pullEvents()`
    // empties the buffer, so draining inside a callback that could run
    // twice would lose the second half of the events.
    //
    // The consequence, which ADR-0018 chose to document rather than prevent:
    // if the transaction below fails, these events are already gone from the
    // aggregate while its row was never written. Nothing is lost silently —
    // the caller gets the exception — but this instance must not be saved
    // again. A retry on it would write the row with no events at all. Reload
    // the aggregate instead.
    const events = offer.pullEvents();

    // The row and its events in one transaction (ADR-0008). A
    // successful write followed by a failed publication loses the
    // event; the reverse order announces a write that never landed.
    await this.prisma.$transaction(async (tx) => {
      if (expectedVersion === 0) {
        await tx.offer.create({
          data: {
            id: row.id,
            sellerId: row.sellerId,
            productId: row.productId,
            quantityValue: row.quantityValue,
            unitCode: row.unitCode,
            priceAmountMinor: row.priceAmountMinor,
            currency: row.currency,
            pickupAreaId: row.pickupAreaId,
            availableFrom: row.availableFrom,
            availableTo: row.availableTo,
            status: row.status as never,
            // The aggregate's own count here too, not a hardcoded 1. A
            // factory that emits two events — create then publish — leaves
            // the aggregate at 2, and storing 1 would make the next load
            // hand back a version the domain never produced. The outbox's
            // unique index on (aggregate, aggregateId, version) is what
            // exposed this: the second save collided with the row the first
            // had already written for that version (ADR-0012 §3).
            version: row.version,
          },
        });
      } else {
        const result = await tx.offer.updateMany({
          where: { id: row.id, version: expectedVersion, deletedAt: null },
          data: {
            priceAmountMinor: row.priceAmountMinor,
            currency: row.currency,
            status: row.status as never,
            // The aggregate's own count, not `increment: 1`. An aggregate can
            // apply several mutations before a single save, and its version moves
            // once per event: incrementing by one would store fewer than the
            // aggregate counts, and the next load would hand a use case a version
            // the domain never produced. The concurrency guard is unchanged — it
            // is the WHERE clause above (ADR-0012 §3).
            version: row.version,
          },
        });

        if (result.count === 0) {
          throw new StaleVersionError('Offer', expectedVersion, offer.version);
        }
      }

      await appendToOutbox(tx, events);
    });
  }

  private rehydrate(row: OfferPrismaRow): Offer {
    return Offer.rehydrate(offerToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
