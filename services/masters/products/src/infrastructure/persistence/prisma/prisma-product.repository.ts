import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { StaleVersionError, type Clock, type IdGenerator } from '@nafa/shared';
import { Product, type ProductRepository } from '@nafa/products';
import { PrismaService } from './prisma.service';
import {
  productToRow,
  productToSnapshot,
  type ProductPrismaRow,
} from '../mappers/product.mapper';

/**
 * Prisma adapter for the ProductRepository port.
 *
 * Same optimistic-concurrency contract as every repository before it:
 * `save` compares `expectedVersion` in the WHERE clause and raises
 * `StaleVersionError` when the stored row moved; 0 means insert.
 *
 * `findByName` uses raw SQL with `name::text ILIKE` — the Prisma JSON
 * `string_contains` filter only matches top-level string columns, not the
 * { official, aliases } object stored here. Learned the hard way on the
 * geography adapter; applied from day one on this one.
 */
@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  async findByCode(code: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: { code, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  async findByName(name: string): Promise<readonly Product[]> {
    const rows = await this.prisma.$queryRaw<ProductPrismaRow[]>(
      Prisma.sql`
        SELECT * FROM products
        WHERE "deletedAt" IS NULL
          AND "name"::text ILIKE ${'%' + name + '%'}
      `,
    );
    return rows.map((r) => this.rehydrate(r));
  }

  async findByCategory(category: string): Promise<readonly Product[]> {
    const rows = await this.prisma.product.findMany({
      where: { category: category as never, deletedAt: null },
    });
    return rows.map((r) => this.rehydrate(r));
  }

  async save(product: Product, expectedVersion: number): Promise<void> {
    const row = productToRow(product.snapshot());

    if (expectedVersion === 0) {
      await this.prisma.product.create({
        data: {
          id: row.id,
          code: row.code,
          category: row.category as never,
          name: row.name as unknown as Prisma.InputJsonValue,
          units: row.units as unknown as Prisma.InputJsonValue,
          status: row.status as never,
          version: 1,
        },
      });
      return;
    }

    const result = await this.prisma.product.updateMany({
      where: { id: row.id, version: expectedVersion, deletedAt: null },
      data: {
        category: row.category as never,
        name: row.name as unknown as Prisma.InputJsonValue,
        units: row.units as unknown as Prisma.InputJsonValue,
        status: row.status as never,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new StaleVersionError('Product', expectedVersion, product.version);
    }
  }

  private rehydrate(row: ProductPrismaRow): Product {
    return Product.rehydrate(productToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
