import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Everything ambient about the current request.
 *
 * Populated once by {@link RequestContextMiddleware} and readable from
 * anywhere in the call stack without threading a parameter through every
 * function — logging, auditing and automatic audit columns all read it.
 */
export interface RequestContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly ip?: string;
  readonly userAgent?: string;
  readonly locale?: string;
  readonly timezone?: string;
  /** Set after authentication; absent on public routes. */
  user?: AuthenticatedUser;
  readonly startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `context` available to everything it calls. */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/**
 * The active context, or `undefined` outside a request (background job, CLI,
 * test). Callers must handle absence — this is not an error.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * The active context, throwing when there is none.
 * Use where a missing context is a genuine programming error.
 */
export function requireRequestContext(): RequestContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error(
      'No request context. Was RequestContextMiddleware applied, or is this ' +
        'running outside a request?',
    );
  }
  return context;
}

/** The authenticated caller, if the request carried one. */
export function getCurrentUser(): AuthenticatedUser | undefined {
  return storage.getStore()?.user;
}

/** The caller's id — what automatic audit columns record. */
export function getCurrentUserId(): string | undefined {
  return storage.getStore()?.user?.id;
}

export function getCurrentTenantId(): string | undefined {
  return storage.getStore()?.user?.tenantId;
}

/**
 * Attaches the authenticated user to the active context.
 * Called by {@link JwtAuthGuard} once a token has been verified.
 */
export function setCurrentUser(user: AuthenticatedUser): void {
  const context = storage.getStore();
  if (context) {
    context.user = user;
  }
}
