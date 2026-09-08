import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
// `Clock` and `IdGenerator` are imported as VALUES, not types. They are
// abstract classes used as DI tokens, and a `type` import is erased at
// compile time — `emitDecoratorMetadata` then records `Function` instead of
// the class, and Nest has no token to resolve. The service still typechecks,
// still builds, and fails only when something actually boots the module.
// Nothing did until the first HTTP e2e (ADR-0014 §4).
import { Clock, IdGenerator, StaleVersionError } from '@nafa/shared';
import { appendToOutbox } from '@nafa/platform';
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
    // Drained before the transaction opens, and once. `pullEvents()`
    // empties the buffer, so draining inside a callback that could run
    // twice would lose the second half of the events.
    const events = product.pullEvents();

    // The row and its events in one transaction (ADR-0008). A
    // successful write followed by a failed publication loses the
    // event; the reverse order announces a write that never landed.
    await this.prisma.$transaction(async (tx) => {
      if (expectedVersion === 0) {
        await tx.product.create({
          data: {
            id: row.id,
            code: row.code,
            category: row.category as never,
            name: row.name as unknown as Prisma.InputJsonValue,
            units: row.units as unknown as Prisma.InputJsonValue,
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
        const result = await tx.product.updateMany({
          where: { id: row.id, version: expectedVersion, deletedAt: null },
          data: {
            category: row.category as never,
            name: row.name as unknown as Prisma.InputJsonValue,
            units: row.units as unknown as Prisma.InputJsonValue,
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
          throw new StaleVersionError(
            'Product',
            expectedVersion,
            product.version,
          );
        }
      }

      await appendToOutbox(tx, events);
    });
  }

  private rehydrate(row: ProductPrismaRow): Product {
    return Product.rehydrate(productToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
