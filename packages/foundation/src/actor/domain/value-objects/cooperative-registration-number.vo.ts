import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * Registre des Sociétés Coopératives — the register a cooperative is entered
 * in under the OHADA Acte uniforme relatif au droit des sociétés coopératives.
 *
 * A separate identifier from the RCCM, and that separation is the point: a
 * cooperative is not a commercial company, it is a member-owned body governed
 * by its own uniform act. Reusing `Rccm` here would erase a legal distinction
 * that determines which rules apply.
 */
export type CooperativeRegistrationNumber = Brand<
  string,
  'CooperativeRegistrationNumber'
>;

const SHAPE = /^[A-Z]{2}-[A-Z0-9]{2,6}-\d{4}-(SCOOPS|SCOOPCA|COOP)-\d{1,10}$/;

export function cooperativeRegistrationNumber(
  raw: string,
): Result<CooperativeRegistrationNumber, ActorRuleViolation> {
  const canonical = raw
    .trim()
    .toUpperCase()
    .replace(/[\s/]+/g, '-');

  if (!SHAPE.test(canonical)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_COOPERATIVE_REGISTRATION,
        'A cooperative registration number must look like GN-KND-2024-SCOOPS-00123.',
      ),
    );
  }

  return ok(canonical as CooperativeRegistrationNumber);
}
