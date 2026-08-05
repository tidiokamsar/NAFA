import { ErrorCode, NafaError } from '@nafa/shared';

/**
 * Every way the actor domain can refuse, as a stable identifier.
 *
 * Callers branch on `rule`, never on the message: messages get reworded and
 * translated, rules do not. Adding one is safe; changing what an existing one
 * means is a breaking change.
 */
export const ActorRule = {
  // --- value object format ---
  INVALID_ACTOR_ID: 'INVALID_ACTOR_ID',
  INVALID_MEMBERSHIP_ID: 'INVALID_MEMBERSHIP_ID',
  INVALID_PERSON_NAME: 'INVALID_PERSON_NAME',
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
  INVALID_EMAIL_ADDRESS: 'INVALID_EMAIL_ADDRESS',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_RCCM: 'INVALID_RCCM',
  INVALID_NIF: 'INVALID_NIF',
  INVALID_COOPERATIVE_REGISTRATION: 'INVALID_COOPERATIVE_REGISTRATION',
  INVALID_LEGAL_FORM: 'INVALID_LEGAL_FORM',
  INVALID_BIRTH_DATE: 'INVALID_BIRTH_DATE',
  INVALID_INCORPORATION_DATE: 'INVALID_INCORPORATION_DATE',

  // --- uniqueness across the registry ---
  RCCM_ALREADY_REGISTERED: 'RCCM_ALREADY_REGISTERED',
  NIF_ALREADY_REGISTERED: 'NIF_ALREADY_REGISTERED',

  // --- identity ---
  IDENTITY_IMMUTABLE: 'IDENTITY_IMMUTABLE',
  LEGAL_FORM_NOT_ALLOWED_FOR_NATURE: 'LEGAL_FORM_NOT_ALLOWED_FOR_NATURE',

  // --- contact ---
  NO_REACHABLE_CONTACT: 'NO_REACHABLE_CONTACT',

  // --- roles ---
  ROLE_ALREADY_HELD: 'ROLE_ALREADY_HELD',
  ROLE_NOT_HELD: 'ROLE_NOT_HELD',
  ROLE_NATURE_INCOMPATIBLE: 'ROLE_NATURE_INCOMPATIBLE',
  ROLE_VERIFICATION_INSUFFICIENT: 'ROLE_VERIFICATION_INSUFFICIENT',
  ROLE_QUALIFICATION_REQUIRED: 'ROLE_QUALIFICATION_REQUIRED',
  ROLE_QUALIFICATION_UNEXPECTED: 'ROLE_QUALIFICATION_UNEXPECTED',
  ROLE_QUALIFICATION_MISMATCHED: 'ROLE_QUALIFICATION_MISMATCHED',
  ROLE_QUALIFICATION_EMPTY: 'ROLE_QUALIFICATION_EMPTY',

  // --- lifecycle ---
  ACTOR_IS_CLOSED: 'ACTOR_IS_CLOSED',
  ACTOR_NOT_ACTIVATABLE_WITHOUT_ROLE: 'ACTOR_NOT_ACTIVATABLE_WITHOUT_ROLE',
  ACTOR_STATUS_FORBIDS_ROLE_GRANT: 'ACTOR_STATUS_FORBIDS_ROLE_GRANT',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  VERIFICATION_CANNOT_BE_LOWERED: 'VERIFICATION_CANNOT_BE_LOWERED',

  // --- cooperative membership ---
  MEMBER_CANNOT_BE_COOPERATIVE: 'MEMBER_CANNOT_BE_COOPERATIVE',
  MEMBER_ALREADY_ADMITTED: 'MEMBER_ALREADY_ADMITTED',
  MEMBERSHIP_ALREADY_ENDED: 'MEMBERSHIP_ALREADY_ENDED',
  COOPERATIVE_NOT_ACTIVE: 'COOPERATIVE_NOT_ACTIVE',
  NOT_A_COOPERATIVE: 'NOT_A_COOPERATIVE',
} as const;

export type ActorRule = (typeof ActorRule)[keyof typeof ActorRule];

/**
 * The single failure type of the actor domain.
 *
 * It extends `NafaError` rather than throwing framework exceptions, so the
 * same rules run behind an HTTP API, a queue consumer or a CLI. Use cases
 * return it inside a `Result` — a refused business rule is an expected
 * outcome, not an exception.
 *
 * Two constructors, because the distinction survives all the way to the
 * transport layer: a malformed phone number is the caller's mistake (400),
 * while a role the actor is not eligible for is a well-formed request the
 * domain refuses (422). `NafaError` already carries the mapping.
 */
export class ActorRuleViolation extends NafaError {
  readonly rule: ActorRule;

  private constructor(code: ErrorCode, rule: ActorRule, message: string) {
    super(code, message, { details: { rule } });
    this.rule = rule;
  }

  /** The input is not a well-formed value. */
  static invalid(rule: ActorRule, message: string): ActorRuleViolation {
    return new ActorRuleViolation(ErrorCode.VALIDATION_FAILED, rule, message);
  }

  /** The input is well-formed but the domain refuses it in this state. */
  static violated(rule: ActorRule, message: string): ActorRuleViolation {
    return new ActorRuleViolation(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      rule,
      message,
    );
  }

  /** A status change the lifecycle does not allow. */
  static transition(rule: ActorRule, message: string): ActorRuleViolation {
    return new ActorRuleViolation(
      ErrorCode.INVALID_STATE_TRANSITION,
      rule,
      message,
    );
  }
}
