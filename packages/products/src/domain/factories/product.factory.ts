import type { Clock, IdGenerator } from '@nafa/shared';
import { Product } from '../product.aggregate';
import { productId } from '../product-id.vo';
import { productCode } from '../product-code.vo';
import { productName } from '../product-name.vo';
import { productCategory } from '../product-category.vo';
import { unitOfMeasure, type UnitKind } from '../unit-of-measure.vo';

/** A unit as plain input — the factory wraps the VO. */
export interface UnitInput {
  readonly code: string;
  readonly name: string;
  readonly kind: UnitKind;
  readonly baseUnit?: string;
  readonly factorToBase: number;
}

/**
 * Builds a `Product` from plain inputs.
 *
 * The convenience entry point for use cases: the aggregate's `register`
 * expects pre-validated VOs, the factory validates them so the caller
 * does not have to. Uniqueness of the code (invariant 2) is deliberately
 * NOT checked here — it spans the collection and is asked of the store
 * through `ProductCodeUniquenessChecker`.
 */
export function createProduct(input: {
  readonly code: string;
  readonly category: string;
  readonly officialName: string;
  readonly aliases?: readonly string[];
  readonly units: readonly UnitInput[];
  readonly clock: Clock;
  readonly ids: IdGenerator;
}) {
  const id = productId(input.ids.generate());
  if (!id.ok) return id;

  const code = productCode(input.code);
  if (!code.ok) return code;

  const category = productCategory(input.category);
  if (!category.ok) return category;

  const name = productName({
    official: input.officialName,
    aliases: input.aliases,
  });
  if (!name.ok) return name;

  const units = [];
  for (const unit of input.units) {
    const built = unitOfMeasure(unit);
    if (!built.ok) return built;
    units.push(built.value);
  }

  return Product.register(
    {
      productId: id.value,
      code: code.value,
      category: category.value,
      name: name.value,
      units,
    },
    { clock: input.clock, ids: input.ids },
  );
}
