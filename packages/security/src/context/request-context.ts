import { AsyncLocalStorage } from 'node:async_hooks';
import type { Channel } from '@nafa/shared';
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
  /** Distributed-trace id. Falls back to the correlation id when absent. */
  readonly traceId: string;
  readonly ip?: string;
  readonly userAgent?: string;
  /** Surface the request arrived through. */
  readonly channel?: Channel;
  /** Opaque device identifier supplied by mobile clients. */
  readonly device?: string;
  /** BCP 47 language tag, e.g. `fr-GN`. */
  readonly locale?: string;
  /** IANA timezone, e.g. `Africa/Conakry`. */
  readonly timezone?: string;
  /** ISO 4217 currency, e.g. `GNF`. Set once pricing is in play. */
  readonly currency?: string;
  /**
   * Tenant from the header, for callers that are not yet authenticated.
   * Once a user is attached, `user.tenantId` is authoritative — a header is
   * caller-supplied and must never override a value that came from a token.
   */
  readonly headerTenantId?: string;
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

/**
 * The tenant in effect: the authenticated user's, falling back to the header
 * for unauthenticated calls. Token wins — a header is caller-controlled.
 */
export function getCurrentTenantId(): string | undefined {
  const context = storage.getStore();
  return context?.user?.tenantId ?? context?.headerTenantId;
}

export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId;
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
