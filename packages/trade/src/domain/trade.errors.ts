import { ErrorCode, NafaError } from '@nafa/shared';

/**
 * Every way the trade domain can refuse, as a stable identifier.
 *
 * Callers branch on `rule`, never on the message: messages get reworded
 * and translated, rules do not. Adding one is safe; changing what an
 * existing one means is a breaking change.
 */
export const TradeRule = {
  // --- value object format ---
  INVALID_OFFER_ID: 'INVALID_OFFER_ID',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_PRICE: 'INVALID_PRICE',
  INVALID_WINDOW: 'INVALID_WINDOW',

  // --- aggregate invariants ---
  SELLER_NOT_ACTIVE: 'SELLER_NOT_ACTIVE',
  PRODUCT_NOT_PUBLISHED: 'PRODUCT_NOT_PUBLISHED',
  UNIT_NOT_DECLARED: 'UNIT_NOT_DECLARED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  OFFER_NOT_PUBLISHED: 'OFFER_NOT_PUBLISHED',
  OFFER_TERMINATED: 'OFFER_TERMINATED',
  IDENTITY_IMMUTABLE: 'IDENTITY_IMMUTABLE',
} as const;

export type TradeRule = (typeof TradeRule)[keyof typeof TradeRule];

/**
 * The single failure type of the trade domain.
 *
 * Same three-constructor pattern as Actor, Geography and Product
 * violations: invalid shape, violated business rule, refused lifecycle
 * transition.
 */
export class TradeRuleViolation extends NafaError {
  readonly rule: TradeRule;

  private constructor(code: ErrorCode, rule: TradeRule, message: string) {
    super(code, message, { details: { rule } });
    this.rule = rule;
  }

  /** The input is not a well-formed value. */
  static invalid(rule: TradeRule, message: string): TradeRuleViolation {
    return new TradeRuleViolation(ErrorCode.VALIDATION_FAILED, rule, message);
  }

  /** The input is well-formed but the domain refuses it in this state. */
  static violated(rule: TradeRule, message: string): TradeRuleViolation {
    return new TradeRuleViolation(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      rule,
      message,
    );
  }

  /** A lifecycle change the status machine does not allow. */
  static transition(rule: TradeRule, message: string): TradeRuleViolation {
    return new TradeRuleViolation(
      ErrorCode.INVALID_STATE_TRANSITION,
      rule,
      message,
    );
  }
}
