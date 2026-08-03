import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from './actor.errors';

/**
 * Where the actor stands in its lifecycle.
 *
 * A separate axis from `VerificationLevel`: status says whether the actor may
 * act, verification says how far its identity was checked. An actor can be
 * ACTIVE at BASIC forever.
 */
export const ActorStatus = {
  /** Being filled in. Not yet submitted, cannot act. */
  DRAFT: 'DRAFT',
  /** Submitted, awaiting identity checks. */
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  /** May act in every role it holds. */
  ACTIVE: 'ACTIVE',
  /** Temporarily barred. Roles are kept so reactivation restores them. */
  SUSPENDED: 'SUSPENDED',
  /** Terminal. Kept for history, never resurrected. */
  CLOSED: 'CLOSED',
} as const;

export type ActorStatus = (typeof ActorStatus)[keyof typeof ActorStatus];

/**
 * Allowed moves, declared once.
 *
 * CLOSED has no outgoing edge on purpose. Reopening an actor would silently
 * reuse an identity that was retired, and the audit trail would show one
 * continuous life where there were two. Registering again is the honest path.
 */
const TRANSITIONS: Record<ActorStatus, readonly ActorStatus[]> = {
  [ActorStatus.DRAFT]: [ActorStatus.PENDING_VERIFICATION, ActorStatus.CLOSED],
  [ActorStatus.PENDING_VERIFICATION]: [ActorStatus.ACTIVE, ActorStatus.CLOSED],
  [ActorStatus.ACTIVE]: [ActorStatus.SUSPENDED, ActorStatus.CLOSED],
  [ActorStatus.SUSPENDED]: [ActorStatus.ACTIVE, ActorStatus.CLOSED],
  [ActorStatus.CLOSED]: [],
};

export function canTransition(from: ActorStatus, to: ActorStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function checkTransition(
  from: ActorStatus,
  to: ActorStatus,
): Result<void, ActorRuleViolation> {
  if (!canTransition(from, to)) {
    return err(
      ActorRuleViolation.transition(
        ActorRule.INVALID_STATUS_TRANSITION,
        `An actor cannot go from ${from} to ${to}.`,
      ),
    );
  }
  return ok(undefined);
}

/**
 * `CLOSED` and nothing else.
 *
 * A terminal status is not merely the end of the status machine: it is the end
 * of the record. Letting a closed actor change its address, gain a
 * verification level or lose a role would keep rewriting a life that is over,
 * and every one of those changes would emit an event that consumers have no
 * reason to expect.
 */
export function isTerminal(status: ActorStatus): boolean {
  return status === ActorStatus.CLOSED;
}

/** Statuses in which the actor may be granted new roles. */
export function acceptsRoleGrant(status: ActorStatus): boolean {
  // Not ACTIVE-only: roles are assembled before activation, and invariant 2
  // requires at least one role to become ACTIVE at all.
  return (
    status === ActorStatus.DRAFT ||
    status === ActorStatus.PENDING_VERIFICATION ||
    status === ActorStatus.ACTIVE
  );
}
