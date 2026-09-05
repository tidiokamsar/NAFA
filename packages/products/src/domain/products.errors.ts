import { ErrorCode, NafaError } from '@nafa/shared';

/**
 * Every way the product domain can refuse, as a stable identifier.
 *
 * Callers branch on `rule`, never on the message: messages get reworded
 * and translated, rules do not. Adding one is safe; changing what an
 * existing one means is a breaking change.
 */
export const ProductRule = {
  // --- value object format ---
  INVALID_PRODUCT_ID: 'INVALID_PRODUCT_ID',
  INVALID_PRODUCT_CODE: 'INVALID_PRODUCT_CODE',
  INVALID_PRODUCT_NAME: 'INVALID_PRODUCT_NAME',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  INVALID_UNIT: 'INVALID_UNIT',

  // --- aggregate invariants ---
  PRODUCT_CODE_NOT_UNIQUE: 'PRODUCT_CODE_NOT_UNIQUE',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  CATEGORY_IMMUTABLE_ONCE_PUBLISHED: 'CATEGORY_IMMUTABLE_ONCE_PUBLISHED',
  PRODUCT_NOT_PUBLISHED: 'PRODUCT_NOT_PUBLISHED',
  PRODUCT_DEPRECATED: 'PRODUCT_DEPRECATED',
  DUPLICATE_UNIT: 'DUPLICATE_UNIT',
  UNKNOWN_UNIT: 'UNKNOWN_UNIT',
} as const;

export type ProductRule = (typeof ProductRule)[keyof typeof ProductRule];

/**
 * The single failure type of the product domain.
 *
 * Same three-constructor pattern as `ActorRuleViolation` and
 * `GeographyRuleViolation`: invalid shape, violated business rule, or
 * refused lifecycle transition.
 */
export class ProductRuleViolation extends NafaError {
  readonly rule: ProductRule;

  private constructor(code: ErrorCode, rule: ProductRule, message: string) {
    super(code, message, { details: { rule } });
    this.rule = rule;
  }

  /** The input is not a well-formed value. */
  static invalid(rule: ProductRule, message: string): ProductRuleViolation {
    return new ProductRuleViolation(ErrorCode.VALIDATION_FAILED, rule, message);
  }

  /** The input is well-formed but the domain refuses it in this state. */
  static violated(rule: ProductRule, message: string): ProductRuleViolation {
    return new ProductRuleViolation(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      rule,
      message,
    );
  }

  /** A lifecycle change the status machine does not allow. */
  static transition(rule: ProductRule, message: string): ProductRuleViolation {
    return new ProductRuleViolation(
      ErrorCode.INVALID_STATE_TRANSITION,
      rule,
      message,
    );
  }
}
