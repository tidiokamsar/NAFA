import { Injectable, Logger, Optional } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import {
  SecurityAuditSink,
  SecurityEventType,
  type SecurityEvent,
  type SecurityEventOutcome,
} from './security-event.types';

/**
 * Default sink: writes structured lines to the application logger.
 *
 * Good enough to be useful from day one and to be shipped to a SIEM by the log
 * pipeline; swap in a database or queue sink when retention requirements
 * demand it.
 */
@Injectable()
export class LoggerSecurityAuditSink extends SecurityAuditSink {
  private readonly logger = new Logger('SecurityAudit');

  record(event: SecurityEvent): void {
    const message = `${event.type} ${event.outcome}`;
    if (event.outcome === 'failure') {
      this.logger.warn({ securityEvent: event }, message);
    } else {
      this.logger.log({ securityEvent: event }, message);
    }
  }
}

/**
 * Records security events, filling in request metadata automatically.
 *
 * Callers supply what only they know (which user, which resource, why); the
 * request id, correlation id, ip and user agent come from the ambient
 * {@link RequestContext} so no call site has to remember them.
 */
@Injectable()
export class SecurityAuditService {
  constructor(@Optional() private readonly sink?: SecurityAuditSink) {}

  private async emit(
    type: SecurityEventType,
    outcome: SecurityEventOutcome,
    details: Partial<SecurityEvent> = {},
  ): Promise<void> {
    const context = getRequestContext();

    const event: SecurityEvent = {
      type,
      outcome,
      timestamp: new Date().toISOString(),
      requestId: context?.requestId,
      correlationId: context?.correlationId,
      ip: context?.ip,
      userAgent: context?.userAgent,
      userId: details.userId ?? context?.user?.id,
      tenantId: details.tenantId ?? context?.user?.tenantId,
      ...details,
    };

    // Auditing must never break the request it is describing.
    try {
      await this.sink?.record(event);
    } catch {
      /* swallowed on purpose */
    }
  }

  loginSuccess(userId: string, metadata?: Record<string, unknown>) {
    return this.emit(SecurityEventType.LOGIN_SUCCESS, 'success', {
      userId,
      metadata,
    });
  }

  /**
   * @param identifier the email or username that was tried. Recorded as
   *   metadata, not as `userId`: a failed login may name no real account.
   */
  loginFailure(identifier: string, reason: string) {
    return this.emit(SecurityEventType.LOGIN_FAILURE, 'failure', {
      reason,
      metadata: { identifier },
    });
  }

  tokenRejected(reason: string) {
    return this.emit(SecurityEventType.TOKEN_REJECTED, 'failure', { reason });
  }

  permissionDenied(action: string, reason: string, resource?: string) {
    return this.emit(SecurityEventType.PERMISSION_DENIED, 'failure', {
      action,
      resource,
      reason,
    });
  }

  roleDenied(action: string, reason: string) {
    return this.emit(SecurityEventType.ROLE_DENIED, 'failure', {
      action,
      reason,
    });
  }

  policyDenied(action: string, reason: string, resource?: string) {
    return this.emit(SecurityEventType.POLICY_DENIED, 'failure', {
      action,
      resource,
      reason,
    });
  }

  rateLimitExceeded(key: string) {
    return this.emit(SecurityEventType.RATE_LIMIT_EXCEEDED, 'failure', {
      metadata: { key },
    });
  }
}
