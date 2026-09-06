import { Injectable } from '@nestjs/common';
import type { ProductId, UnitCode } from '@nafa/products';
import { type ProductCatalog, type PublishedProduct } from '@nafa/trade';
import { PrismaService } from './prisma.service';

/**
 * Prisma adapter for the ProductCatalog port — the Products Master as the
 * trade service sees it.
 *
 * Reads the central products table directly: one schema, one database, and
 * the trade client (generated from the same schema.prisma) carries the
 * product model. The day products live behind a service boundary, this
 * adapter is the single place that changes — that is what the port buys.
 *
 * The units come back from the JSONB column as the declared
 * UnitOfMeasure[]; only the codes cross the port (ADR-0011 §3 — the
 * catalog answers existence and units, nothing else).
 */
@Injectable()
export class PrismaProductCatalog implements ProductCatalog {
  constructor(private readonly prisma: PrismaService) {}

  async getPublishedProduct(
    productId: ProductId,
  ): Promise<PublishedProduct | null> {
    const row = await this.prisma.product.findFirst({
      where: { id: productId as string, status: 'PUBLISHED', deletedAt: null },
      select: { id: true, units: true },
    });

    if (!row) return null;

    const units = (row.units as { code: string }[]).map(
      (u) => u.code as UnitCode,
    );

    return { productId: row.id as ProductId, units };
  }
}
