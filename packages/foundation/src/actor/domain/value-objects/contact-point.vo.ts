import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';
import type { EmailAddress } from './email-address.vo';
import type { PhoneNumber } from './phone-number.vo';

/**
 * One way of reaching the actor.
 *
 * A list rather than a record with optional fields, because actors really do
 * have several: a producer in Kindia commonly carries two mobile numbers on
 * two networks, and a company has a switchboard and a manager's line. Modelling
 * one phone and one email would force the second of each to be dropped or
 * squeezed into a free-text field.
 */
export const ContactChannel = {
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
} as const;

export type ContactChannel =
  (typeof ContactChannel)[keyof typeof ContactChannel];

export interface PhoneContactPoint {
  readonly channel: typeof ContactChannel.PHONE;
  readonly value: PhoneNumber;
}

export interface EmailContactPoint {
  readonly channel: typeof ContactChannel.EMAIL;
  readonly value: EmailAddress;
}

export type ContactPoint = PhoneContactPoint | EmailContactPoint;

export function phoneContact(value: PhoneNumber): PhoneContactPoint {
  return { channel: ContactChannel.PHONE, value };
}

export function emailContact(value: EmailAddress): EmailContactPoint {
  return { channel: ContactChannel.EMAIL, value };
}

/**
 * At least one contact point, deduplicated.
 *
 * The minimum is a real invariant, not form validation: an actor nobody can
 * reach cannot be verified, so it could never leave PENDING_VERIFICATION and
 * would sit in the registry forever.
 */
export function contactPoints(
  points: readonly ContactPoint[],
): Result<readonly ContactPoint[], ActorRuleViolation> {
  const seen = new Set<string>();
  const distinct: ContactPoint[] = [];

  for (const point of points) {
    const key = `${point.channel}:${point.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      distinct.push(point);
    }
  }

  if (distinct.length === 0) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.NO_REACHABLE_CONTACT,
        'An actor needs at least one contact point.',
      ),
    );
  }

  return ok(distinct);
}

export function isReachable(points: readonly ContactPoint[]): boolean {
  return points.length > 0;
}

/** The distinct channels available, for events and display. */
export function channelsOf(
  points: readonly ContactPoint[],
): readonly ContactChannel[] {
  return [...new Set(points.map((point) => point.channel))];
}
