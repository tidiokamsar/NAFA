import { ErrorCode, NafaError } from '@nafa/shared';

/**
 * Every way the geography domain can refuse, as a stable identifier.
 *
 * Callers branch on `rule`, never on the message: messages get reworded and
 * translated, rules do not.  Adding one is safe; changing what an existing
 * one means is a breaking change.
 */
export const GeographyRule = {
  // --- value object format (shared) ---
  INVALID_COUNTRY_CODE: 'INVALID_COUNTRY_CODE',
  INVALID_LEVEL: 'INVALID_LEVEL',
  INVALID_LABEL: 'INVALID_LABEL',

  // --- country profile invariants ---
  LEVELS_NOT_CONTIGUOUS: 'LEVELS_NOT_CONTIGUOUS',
  DUPLICATE_LEVEL: 'DUPLICATE_LEVEL',
  PUBLISHED_REQUIRES_LEVEL: 'PUBLISHED_REQUIRES_LEVEL',
  LEVEL_IN_USE: 'LEVEL_IN_USE',

  // --- lifecycle (shared) ---
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',

  // --- administrative area value objects ---
  INVALID_AREA_ID: 'INVALID_AREA_ID',
  INVALID_AREA_CODE: 'INVALID_AREA_CODE',
  INVALID_AREA_NAME: 'INVALID_AREA_NAME',
  INVALID_CENTROID: 'INVALID_CENTROID',
  INVALID_PERIOD: 'INVALID_PERIOD',

  // --- administrative area invariants ---
  PARENT_LEVEL_MISMATCH: 'PARENT_LEVEL_MISMATCH',
  ROOT_CANNOT_HAVE_PARENT: 'ROOT_CANNOT_HAVE_PARENT',
  NON_ROOT_REQUIRES_PARENT: 'NON_ROOT_REQUIRES_PARENT',
  LEVEL_NOT_DECLARED_IN_PROFILE: 'LEVEL_NOT_DECLARED_IN_PROFILE',
  PROFILE_NOT_PUBLISHED: 'PROFILE_NOT_PUBLISHED',
  SUCCESSORS_REQUIRED: 'SUCCESSORS_REQUIRED',
  DISSOLVE_REQUIRES_NO_SUCCESSORS: 'DISSOLVE_REQUIRES_NO_SUCCESSORS',
  SPLIT_REQUIRES_TWO_SUCCESSORS: 'SPLIT_REQUIRES_TWO_SUCCESSORS',
  HAS_ACTIVE_CHILDREN: 'HAS_ACTIVE_CHILDREN',
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
