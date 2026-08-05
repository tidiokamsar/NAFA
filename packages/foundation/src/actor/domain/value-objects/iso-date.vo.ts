import { type IsoDate, isoDate as parseIsoDate } from '@nafa/shared';
import { err, type Result } from '@nafa/shared';
import { type ActorRule, ActorRuleViolation } from '../actor.errors';

// Re-exported so the internal callers that `import type { IsoDate }` from a
// relative path keep compiling. The definition itself now lives in the shared
// kernel — see ADR-0009 §6. This file is the actor-side adapter only.
export type { IsoDate };

/**
 * Parses a calendar date on behalf of the actor domain, wrapping the
 * domain-agnostic failure into an `ActorRuleViolation`.
 *
 * Delegates to `@nafa/shared`'s `isoDate` for the actual parsing, then maps the
 * generic `ValidationError` to the actor rule the caller named. Each Master
 * wraps the shared failure its own way; this is the actor way.
 *
 * @param rule  The actor rule to attribute a malformed date to.
 * @param label Human-readable name of the field, used in the error message.
 */
export function isoDate(
  raw: string,
  rule: ActorRule,
  label: string,
): Result<IsoDate, ActorRuleViolation> {
  const result = parseIsoDate(raw, label);
  if (!result.ok) {
    return err(ActorRuleViolation.invalid(rule, result.error.message));
  }
  return result;
}
