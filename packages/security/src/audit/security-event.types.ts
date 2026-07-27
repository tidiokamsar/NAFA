/**
 * Security events worth recording regardless of the service producing them.
 *
 * Kept separate from business audit (the `createdBy`/`updatedBy` columns):
 * these answer "who tried to get in, and did it work?", which is what a
 * security review or an incident investigation actually reads.
 */
export enum SecurityEventType {
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGOUT = 'auth.logout',
  TOKEN_ISSUED = 'auth.token.issued',
  TOKEN_REFRESHED = 'auth.token.refreshed',
  TOKEN_REJECTED = 'auth.token.rejected',
  PERMISSION_DENIED = 'authz.permission.denied',
  ROLE_DENIED = 'authz.role.denied',
  POLICY_DENIED = 'authz.policy.denied',
  RATE_LIMIT_EXCEEDED = 'security.rate_limit.exceeded',
  PASSWORD_CHANGED = 'auth.password.changed',
  SESSIONS_REVOKED = 'auth.sessions.revoked',
}

export type SecurityEventOutcome = 'success' | 'failure';

export interface SecurityEvent {
  type: SecurityEventType;
  outcome: SecurityEventOutcome;
  /** ISO 8601. */
  timestamp: string;
  /** Subject id when known. Absent on a failed login with an unknown user. */
  userId?: string;
  tenantId?: string;
  requestId?: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
  /** Resource and action involved, for authorisation failures. */
  resource?: string;
  action?: string;
  /** Why it failed. Logged, never returned to the caller. */
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Where security events go.
 *
 * An interface rather than a concrete implementation because the destination
 * differs per environment: logs in development, a SIEM or an append-only
 * table in production. The default sink writes to the application logger.
 */
export abstract class SecurityAuditSink {
  abstract record(event: SecurityEvent): void | Promise<void>;
}
