import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * What an actor *does*, as opposed to what it is.
 *
 * A set, never a hierarchy. A cooperative in Kindia is simultaneously a
 * producer (it farms), a buyer (it buys from its members) and often a
 * wholesaler (it resells in bulk). Modelling these as subclasses of Actor
 * would force one choice per actor and break at the first real registration.
 *
 * These are capabilities, not modules. A role says the actor may act in this
 * capacity; what it actually grows, carries or stores belongs to the masters
 * that own those things.
 */
export const RoleType = {
  /** Grows, raises, catches or processes. */
  PRODUCER: 'PRODUCER',
  /** Sells to end customers. */
  MERCHANT: 'MERCHANT',
  /** Sells in bulk to other businesses. */
  WHOLESALER: 'WHOLESALER',
  /** Brings goods across the customs border. */
  IMPORTER: 'IMPORTER',
  /** Moves goods for others. */
  TRANSPORTER: 'TRANSPORTER',
  /** Buys for its own use or resale. */
  BUYER: 'BUYER',
  /** Holds funds or issues payment instruments. */
  FINANCIAL: 'FINANCIAL',
} as const;

export type RoleType = (typeof RoleType)[keyof typeof RoleType];

export const ALL_ROLE_TYPES: readonly RoleType[] = Object.values(RoleType);

export function roleType(raw: string): Result<RoleType, ActorRuleViolation> {
  const candidate = raw.trim().toUpperCase();

  if (!ALL_ROLE_TYPES.includes(candidate as RoleType)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.ROLE_NATURE_INCOMPATIBLE,
        `Unknown role "${raw}". Expected one of ${ALL_ROLE_TYPES.join(', ')}.`,
      ),
    );
  }

  return ok(candidate as RoleType);
}
