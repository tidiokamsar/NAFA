import { Injectable } from '@nestjs/common';
import { StaleVersionError, type Clock, type IdGenerator } from '@nafa/shared';
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

    if (expectedVersion === 0) {
      await this.prisma.offer.create({
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
          version: 1,
        },
      });
      return;
    }

    const result = await this.prisma.offer.updateMany({
      where: { id: row.id, version: expectedVersion, deletedAt: null },
      data: {
        priceAmountMinor: row.priceAmountMinor,
        currency: row.currency,
        status: row.status as never,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new StaleVersionError('Offer', expectedVersion, offer.version);
    }
  }

  private rehydrate(row: OfferPrismaRow): Offer {
    return Offer.rehydrate(offerToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
