import { ErrorCode, NafaError } from '@nafa/shared';

/**
 * Every way the geography domain can refuse, as a stable identifier.
 *
 * Callers branch on `rule`, never on the message: messages get reworded and
 * translated, rules do not.  Adding one is safe; changing what an existing
 * one means is a breaking change.
 */
export const GeographyRule = {
  // --- value object format ---
  INVALID_COUNTRY_CODE: 'INVALID_COUNTRY_CODE',
  INVALID_LEVEL: 'INVALID_LEVEL',
  INVALID_LABEL: 'INVALID_LABEL',

  // --- country profile invariants ---
  LEVELS_NOT_CONTIGUOUS: 'LEVELS_NOT_CONTIGUOUS',
  DUPLICATE_LEVEL: 'DUPLICATE_LEVEL',
  PUBLISHED_REQUIRES_LEVEL: 'PUBLISHED_REQUIRES_LEVEL',
  LEVEL_IN_USE: 'LEVEL_IN_USE',

  // --- lifecycle ---
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
} as const;

export type GeographyRule = (typeof GeographyRule)[keyof typeof GeographyRule];

/**
 * The single failure type of the geography domain.
 *
 * Follows the same pattern as `ActorRuleViolation` in `@nafa/foundation`:
 * three constructors mapping to HTTP status codes via `NafaError`.
 */
export class GeographyRuleViolation extends NafaError {
  readonly rule: GeographyRule;

  private constructor(code: ErrorCode, rule: GeographyRule, message: string) {
    super(code, message, { details: { rule } });
    this.rule = rule;
  }

  /** The input is not a well-formed value. */
  static invalid(rule: GeographyRule, message: string): GeographyRuleViolation {
    return new GeographyRuleViolation(
      ErrorCode.VALIDATION_FAILED,
      rule,
      message,
    );
  }

  /** The input is well-formed but the domain refuses it in this state. */
  static violated(
    rule: GeographyRule,
    message: string,
  ): GeographyRuleViolation {
    return new GeographyRuleViolation(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      rule,
      message,
    );
  }

  /** A status change the lifecycle does not allow. */
  static transition(
    rule: GeographyRule,
    message: string,
  ): GeographyRuleViolation {
    return new GeographyRuleViolation(
      ErrorCode.INVALID_STATE_TRANSITION,
      rule,
      message,
    );
  }
}
