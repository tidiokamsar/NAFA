import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/** Stored lowercased, so two spellings of the same address compare equal. */
export type EmailAddress = Brand<string, 'EmailAddress'>;

// Deliberately permissive. The only way to know an address exists is to send
// to it; a stricter pattern buys nothing and rejects valid addresses. This
// catches the typos worth catching — missing @, missing domain, whitespace.
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function emailAddress(
  raw: string,
): Result<EmailAddress, ActorRuleViolation> {
  const canonical = raw.trim().toLowerCase();

  if (!SHAPE.test(canonical)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_EMAIL_ADDRESS,
        'An email address must look like name@domain.tld.',
      ),
    );
  }

  return ok(canonical as EmailAddress);
}
