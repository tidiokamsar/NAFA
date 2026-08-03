import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * A natural person's name.
 *
 * Two fields, not one, because they are used differently: `familyName` sorts
 * and matches, `givenNames` addresses. Beyond that the model stays out of the
 * way — no title, no middle-name slot, no ordering assumption. Naming
 * conventions across NAFA's markets do not agree on any of it, and a field
 * that half the population cannot fill correctly is worse than no field.
 */
export interface PersonName {
  readonly givenNames: string;
  readonly familyName: string;
}

const MAX_LENGTH = 120;

function clean(raw: string): string {
  // Collapse runs of whitespace so " Mamadou  Alpha " and "Mamadou Alpha"
  // are the same name.
  return raw.trim().replace(/\s+/g, ' ');
}

export function personName(
  givenNames: string,
  familyName: string,
): Result<PersonName, ActorRuleViolation> {
  const given = clean(givenNames);
  const family = clean(familyName);

  if (given.length === 0 || family.length === 0) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_PERSON_NAME,
        'Given names and family name are both required.',
      ),
    );
  }

  if (given.length > MAX_LENGTH || family.length > MAX_LENGTH) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_PERSON_NAME,
        `A name part cannot exceed ${MAX_LENGTH} characters.`,
      ),
    );
  }

  return ok({ givenNames: given, familyName: family });
}
