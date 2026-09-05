import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '@nafa/shared';
import {
  ProductRule,
  ProductRuleViolation,
  type ProductCodeUniquenessChecker,
} from '@nafa/products';
import { PrismaService } from './prisma.service';

/**
 * Prisma adapter for the ProductCodeUniquenessChecker port.
 *
 * Uniqueness spans the whole catalogue — no single aggregate can see its
 * siblings — so the check is asked of the store. This is the reason
 * invariant 2 (code unique globally, ADR-0010 §3) lives outside the Product
 * aggregate.
 *
 * A check, not a lock: the unique index on products.code is what finally
 * decides; checking here turns the common case into a clear business
 * refusal instead of a constraint violation surfacing three layers up.
 */
@Injectable()
export class PrismaProductCodeUniquenessChecker implements ProductCodeUniquenessChecker {
  constructor(private readonly prisma: PrismaService) {}

  async check(
    code: string,
    excluding?: string,
  ): Promise<Result<void, ProductRuleViolation>> {
    const existing = await this.prisma.product.findFirst({
      where: {
        code,
        deletedAt: null,
        ...(excluding ? { NOT: { id: excluding } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      return err(
        ProductRuleViolation.violated(
          ProductRule.PRODUCT_CODE_NOT_UNIQUE,
          `Product code "${code}" is already in use in the catalogue.`,
        ),
      );
    }

    return ok(undefined);
  }
}
