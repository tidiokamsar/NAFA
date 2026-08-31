import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ProductRule, ProductRuleViolation } from './products.errors';

/** What a unit measures — fixes which base units make sense. */
export enum UnitKind {
  WEIGHT = 'WEIGHT',
  VOLUME = 'VOLUME',
  COUNT = 'COUNT',
}

/**
 * The code of a unit of measure — `KG`, `T`, `SAC_50`, `L`.
 *
 * Branded so a unit code cannot be confused with a product code.
 */
export type UnitCode = Brand<string, 'UnitCode'>;

/**
 * One unit a product is traded in, with its conversion to the metric base
 * of its dimension (ADR-0010 §5): `SAC_50` is 50 × `KG`.
 *
 * The base unit (`baseUnit` omitted) is the metric anchor — `KG`, `L`,
 * `UNIT` — with factor 1 by definition. Derived units carry the base they
 * convert to and a strictly positive factor. Units that vary by market
 * (a cabas that holds 2 or 3 kg depending on the city) are deliberately
 * absent: their live conversion belongs to the trade, not the reference.
 */
export interface UnitOfMeasure {
  readonly code: UnitCode;
  readonly name: string;
  readonly kind: UnitKind;
  /** The metric base this unit converts to; the unit itself if omitted. */
  readonly baseUnit?: UnitCode;
  /** How many base units this one contains. 1 for a base unit. */
  readonly factorToBase: number;
}

const UNIT_CODE = /^[A-Z0-9_]{1,10}$/;

/** The conventional metric base of each dimension. */
const BASE_BY_KIND: Record<UnitKind, string> = {
  [UnitKind.WEIGHT]: 'KG',
  [UnitKind.VOLUME]: 'L',
  [UnitKind.COUNT]: 'UNIT',
};

/**
 * Builds a validated unit of measure.
 *
 * Invariant 5: the code is well-formed, the name is non-empty, the factor
 * is strictly positive, and a derived unit's base differs from itself and
 * stays within the same dimension (a weight never converts to litres).
 */
export function unitOfMeasure(input: {
  code: string;
  name: string;
  kind: UnitKind;
  baseUnit?: string;
  factorToBase: number;
}): Result<UnitOfMeasure, ProductRuleViolation> {
  const code = input.code.trim().toUpperCase();
  if (!UNIT_CODE.test(code)) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_UNIT,
        `Unit code must be 1-10 characters of A-Z, 0-9 or _; got "${input.code}".`,
      ),
    );
  }

  const name = input.name.trim();
  if (name.length === 0) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_UNIT,
        `Unit ${code} must have a non-empty name.`,
      ),
    );
  }

  if (!Number.isFinite(input.factorToBase) || input.factorToBase <= 0) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_UNIT,
        `Unit ${code} must have a strictly positive conversion factor; got ${input.factorToBase}.`,
      ),
    );
  }

  const baseUnit = input.baseUnit?.trim().toUpperCase();
  if (baseUnit !== undefined && !UNIT_CODE.test(baseUnit)) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_UNIT,
        `Base unit code must be well-formed; got "${input.baseUnit}".`,
      ),
    );
  }

  // A derived unit converts within its own dimension and never to itself.
  if (baseUnit === code) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_UNIT,
        `Unit ${code} cannot use itself as its base.`,
      ),
    );
  }
  if (baseUnit !== undefined && baseUnit !== BASE_BY_KIND[input.kind]) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_UNIT,
        `Unit ${code} (${input.kind}) must convert to ${BASE_BY_KIND[input.kind]}, not "${baseUnit}".`,
      ),
    );
  }

  return ok({
    code: code as UnitCode,
    name,
    kind: input.kind,
    ...(baseUnit !== undefined ? { baseUnit: baseUnit as UnitCode } : {}),
    factorToBase: input.factorToBase,
  });
}

/** The conventional metric base of a dimension — KG, L or UNIT. */
export function metricBase(kind: UnitKind): UnitCode {
  return BASE_BY_KIND[kind] as UnitCode;
}
