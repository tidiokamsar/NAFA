import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/** An E.164 number, stored canonically: `+` followed by digits, nothing else. */
export type PhoneNumber = Brand<string, 'PhoneNumber'>;

// E.164: leading +, country code that cannot start with 0, 8 to 15 digits
// total. Deliberately not restricted to +224: NAFA has cross-border actors,
// and a Guinea-only rule would reject a Malian transporter at registration.
const E164 = /^\+[1-9]\d{7,14}$/;

export function phoneNumber(
  raw: string,
): Result<PhoneNumber, ActorRuleViolation> {
  // Operators, forms and paper records all write the same number differently.
  // Normalising before validating is what makes two spellings compare equal.
  const canonical = raw.replace(/[\s.()/-]/g, '');

  if (!E164.test(canonical)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_PHONE_NUMBER,
        'A phone number must be in E.164 form, e.g. +224620000000.',
      ),
    );
  }

  return ok(canonical as PhoneNumber);
}
