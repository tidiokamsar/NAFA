import { Injectable } from '@nestjs/common';
import { ActorStatus, type ActorId } from '@nafa/foundation';
import type { SellerRegistry } from '@nafa/trade';
import { PrismaService } from './prisma.service';

/**
 * Prisma adapter for the SellerRegistry port — the Actor Master as the trade
 * service sees it.
 *
 * Reads the central actors table directly, the same way PrismaProductCatalog
 * reads products: one schema, one database, and the trade client carries the
 * Actor model. The day actors live behind a service boundary, this adapter
 * is the single place that changes — that is what the port buys.
 *
 * `isActive` answers invariant 2 and nothing else. ACTIVE is the only status
 * that may sell: DRAFT and PENDING_VERIFICATION have not been checked,
 * SUSPENDED is barred, CLOSED is terminal. A soft-deleted row is not an
 * actor at all. The port's contract is deliberately a boolean — the day an
 * offer needs the seller's roles or verification level, the port grows a
 * richer return type and this adapter follows (ADR-0011 §3).
 */
@Injectable()
export class PrismaSellerRegistry implements SellerRegistry {
  constructor(private readonly prisma: PrismaService) {}

  async isActive(sellerId: ActorId): Promise<boolean> {
    const row = await this.prisma.actor.findFirst({
      where: {
        id: sellerId as string,
        status: ActorStatus.ACTIVE as never,
        deletedAt: null,
      },
      select: { id: true },
    });

    return row !== null;
  }
}
