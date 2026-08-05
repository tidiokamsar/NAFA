import type { AuthenticatedUser } from '../auth/auth.types';
import { PolicyEngine } from './policy-engine.service';
import { deny, PERMIT, type Policy, type PolicyContext } from './policy.types';

const subject: AuthenticatedUser = {
  id: 'u1',
  tenantId: 't1',
  roles: [],
  permissions: [],
};

const context: PolicyContext = { subject, action: 'shipment:read' };

const permitAll: Policy = { name: 'permit-all', evaluate: () => PERMIT };
const denyAll: Policy = {
  name: 'deny-all',
  evaluate: () => deny('always denies'),
};

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  it('permits when every named policy permits', async () => {
    engine.register(permitAll);
    await expect(engine.evaluate(['permit-all'], context)).resolves.toEqual({
      effect: 'permit',
    });
  });

  it('denies as soon as one policy denies', async () => {
    engine.registerAll([permitAll, denyAll]);
    const decision = await engine.evaluate(['permit-all', 'deny-all'], context);
    expect(decision.effect).toBe('deny');
    expect(decision.reason).toContain('always denies');
  });

  // Fail-closed: a typo in a policy name must not open the route.
  it('denies when a named policy is not registered', async () => {
    const decision = await engine.evaluate(['does-not-exist'], context);
    expect(decision.effect).toBe('deny');
    expect(decision.reason).toContain('not registered');
  });

  it('denies when no policy is named at all', async () => {
    const decision = await engine.evaluate([], context);
    expect(decision.effect).toBe('deny');
  });

  it('stops evaluating after the first deny', async () => {
    const later = jest.fn().mockReturnValue(PERMIT);
    engine.registerAll([denyAll, { name: 'later', evaluate: later }]);

    await engine.evaluate(['deny-all', 'later'], context);

    expect(later).not.toHaveBeenCalled();
  });

  it('supports asynchronous policies', async () => {
    engine.register({
      name: 'async-permit',
      evaluate: () => Promise.resolve(PERMIT),
    });
    await expect(engine.evaluate(['async-permit'], context)).resolves.toEqual({
      effect: 'permit',
    });
  });

  it('gives policies access to subject and resource attributes', async () => {
    engine.register({
      name: 'same-tenant',
      evaluate: (ctx: PolicyContext<{ tenantId: string }>) =>
        ctx.resource?.tenantId === ctx.subject.tenantId
          ? PERMIT
          : deny('cross-tenant access'),
    });

    await expect(
      engine.evaluate(['same-tenant'], {
        subject,
        action: 'read',
        resource: { tenantId: 't1' },
      }),
    ).resolves.toEqual({ effect: 'permit' });

    const crossTenant = await engine.evaluate(['same-tenant'], {
      subject,
      action: 'read',
      resource: { tenantId: 't2' },
    });
    expect(crossTenant.effect).toBe('deny');
  });
});
