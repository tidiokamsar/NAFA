import { Injectable } from '@nestjs/common';
import type { Policy, PolicyContext, PolicyDecision } from './policy.types';

/**
 * Evaluates policies and combines their decisions.
 *
 * Combining rule: **deny overrides**, and an empty policy set denies.
 *
 * Both halves are deliberate. Deny-overrides means adding a policy can only
 * ever restrict access, never widen it, so a new rule cannot silently open a
 * hole. Denying on an empty set means a route guarded by `@Policies()` that
 * names an unregistered policy fails closed instead of waving everyone
 * through — the failure mode you want when someone typos a policy name.
 */
@Injectable()
export class PolicyEngine {
  private readonly policies = new Map<string, Policy<any>>();

  /** Registers a policy. Re-registering a name replaces it. */
  register(policy: Policy<any>): void {
    this.policies.set(policy.name, policy);
  }

  registerAll(policies: readonly Policy<any>[]): void {
    for (const policy of policies) this.register(policy);
  }

  get(name: string): Policy<any> | undefined {
    return this.policies.get(name);
  }

  /**
   * Evaluates the named policies against `context`.
   *
   * @returns the first deny encountered, otherwise permit.
   */
  async evaluate<TResource>(
    names: readonly string[],
    context: PolicyContext<TResource>,
  ): Promise<PolicyDecision> {
    if (names.length === 0) {
      return { effect: 'deny', reason: 'No policy named; failing closed.' };
    }

    for (const name of names) {
      const policy = this.policies.get(name);
      if (!policy) {
        return {
          effect: 'deny',
          reason: `Policy "${name}" is not registered.`,
        };
      }

      const decision = await policy.evaluate(context);
      if (decision.effect === 'deny') {
        return {
          effect: 'deny',
          reason: decision.reason ?? `Denied by policy "${name}".`,
        };
      }
    }

    return { effect: 'permit' };
  }
}
