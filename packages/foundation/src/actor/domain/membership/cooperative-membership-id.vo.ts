import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * Nominal, and distinct from ActorId.
 *
 * A membership has its own identity rather than being keyed by the pair
 * (cooperative, member): the same person can join, leave and join again, and
 * those are two memberships with two histories. A composite key would force
 * them into one row.
 */
export type CooperativeMembershipId = Brand<string, 'CooperativeMembershipId'>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cooperativeMembershipId(
  raw: string,
): Result<CooperativeMembershipId, ActorRuleViolation> {
  if (!UUID.test(raw)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_MEMBERSHIP_ID,
        'A membership id must be a UUID.',
      ),
    );
  }

  return ok(raw.toLowerCase() as CooperativeMembershipId);
}
