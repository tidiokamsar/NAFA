import type { AuthenticatedUser } from '../auth/auth.types';
import {
  getCurrentTenantId,
  getCurrentUser,
  getCurrentUserId,
  getRequestContext,
  getTraceId,
  requireRequestContext,
  runWithRequestContext,
  setCurrentUser,
  type RequestContext,
} from './request-context';

function contextFixture(): RequestContext {
  return {
    requestId: 'req-1',
    correlationId: 'corr-1',
    traceId: 'trace-1',
    ip: '127.0.0.1',
    startedAt: Date.now(),
  };
}

const user: AuthenticatedUser = {
  id: 'u1',
  tenantId: 't1',
  roles: [],
  permissions: [],
};

describe('RequestContext', () => {
  it('exposes the context inside the run scope', () => {
    runWithRequestContext(contextFixture(), () => {
      expect(getRequestContext()?.requestId).toBe('req-1');
    });
  });

  it('has no context outside a run scope', () => {
    expect(getRequestContext()).toBeUndefined();
    expect(getCurrentUser()).toBeUndefined();
    expect(getCurrentUserId()).toBeUndefined();
  });

  it('throws from requireRequestContext outside a scope', () => {
    expect(() => requireRequestContext()).toThrow(/No request context/);
  });

  it('carries the context across async boundaries', async () => {
    await runWithRequestContext(contextFixture(), async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(getRequestContext()?.correlationId).toBe('corr-1');
    });
  });

  it('attaches the authenticated user to the active context', () => {
    runWithRequestContext(contextFixture(), () => {
      setCurrentUser(user);
      expect(getCurrentUserId()).toBe('u1');
      expect(getCurrentUser()?.tenantId).toBe('t1');
    });
  });

  // Concurrent requests must not see each other's user.
  it('isolates concurrent scopes', async () => {
    const seen: (string | undefined)[] = [];

    await Promise.all([
      runWithRequestContext(
        { ...contextFixture(), requestId: 'a' },
        async () => {
          setCurrentUser({ ...user, id: 'user-a' });
          await new Promise((resolve) => setTimeout(resolve, 10));
          seen.push(getCurrentUserId());
        },
      ),
      runWithRequestContext(
        { ...contextFixture(), requestId: 'b' },
        async () => {
          setCurrentUser({ ...user, id: 'user-b' });
          await new Promise((resolve) => setTimeout(resolve, 1));
          seen.push(getCurrentUserId());
        },
      ),
    ]);

    expect(seen.sort()).toEqual(['user-a', 'user-b']);
  });

  it('ignores setCurrentUser outside a scope instead of throwing', () => {
    expect(() => setCurrentUser(user)).not.toThrow();
  });

  describe('tenant resolution', () => {
    it('falls back to the header tenant before authentication', () => {
      runWithRequestContext(
        { ...contextFixture(), headerTenantId: 'from-header' },
        () => {
          expect(getCurrentTenantId()).toBe('from-header');
        },
      );
    });

    // A header is caller-controlled; a token is signed. Letting the header win
    // would be a cross-tenant access path.
    it('prefers the token tenant over the header', () => {
      runWithRequestContext(
        { ...contextFixture(), headerTenantId: 'from-header' },
        () => {
          setCurrentUser(user);
          expect(getCurrentTenantId()).toBe('t1');
        },
      );
    });

    it('has no tenant when neither is present', () => {
      runWithRequestContext(contextFixture(), () => {
        expect(getCurrentTenantId()).toBeUndefined();
      });
    });
  });

  it('exposes the trace id', () => {
    runWithRequestContext(contextFixture(), () => {
      expect(getTraceId()).toBe('trace-1');
    });
  });
});
