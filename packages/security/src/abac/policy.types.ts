import type { AuthenticatedUser } from '../auth/auth.types';
import type { RequestContext } from '../context/request-context';

export type PolicyEffect = 'permit' | 'deny';

/**
 * What a policy gets to reason about.
 *
 * RBAC answers "does this user hold permission X?". ABAC answers questions
 * RBAC cannot express, because they depend on the specific resource or on the
 * circumstances: "is this user in the same tenant as the document?",
 * "is it within working hours?".
 */
export interface PolicyContext<TResource = unknown> {
  readonly subject: AuthenticatedUser;
  /** The object being acted on. Absent for collection-level actions. */
  readonly resource?: TResource;
  /** The attempted action, conventionally `resource:action`. */
  readonly action: string;
  /** Ambient request data — ip, locale, timestamps. */
  readonly environment?: RequestContext;
}

export interface PolicyDecision {
  effect: PolicyEffect;
  /** Why. Surfaced in security audit events, never to the caller. */
  reason?: string;
}

/**
 * A single authorisation rule.
 *
 * Policies must be side-effect free: the engine may evaluate them in any order
 * and short-circuit on the first deny.
 */
export interface Policy<TResource = unknown> {
  /** Unique, stable — it appears in audit events. */
  readonly name: string;
  evaluate(
    context: PolicyContext<TResource>,
  ): PolicyDecision | Promise<PolicyDecision>;
}

export const PERMIT: PolicyDecision = { effect: 'permit' };

export function deny(reason: string): PolicyDecision {
  return { effect: 'deny', reason };
}
