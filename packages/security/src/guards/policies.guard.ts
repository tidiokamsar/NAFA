import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PolicyEngine } from '../abac/policy-engine.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SecurityAuditService } from '../audit/security-audit.service';
import { getRequestContext } from '../context/request-context';
import { IS_PUBLIC_KEY, POLICIES_KEY } from '../decorators/metadata.keys';

/**
 * Enforces {@link Policies}.
 *
 * The resource passed to policies is the request body, params and query — all
 * a guard can see, since it runs before the handler has loaded anything. A
 * policy needing the persisted entity must be evaluated inside the service
 * with {@link PolicyEngine} directly; guards cannot do that without turning
 * into a data-access layer.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyEngine: PolicyEngine,
    @Optional() private readonly audit?: SecurityAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(POLICIES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    const action = `${request.method} ${request.route?.path ?? request.url}`;

    if (!user) {
      await this.audit?.policyDenied(action, 'No authenticated subject.');
      throw new ForbiddenException('Insufficient permissions');
    }

    const decision = await this.policyEngine.evaluate(required, {
      subject: user,
      action,
      resource: {
        body: request.body,
        params: request.params,
        query: request.query,
      },
      environment: getRequestContext(),
    });

    if (decision.effect === 'deny') {
      await this.audit?.policyDenied(action, decision.reason ?? 'Denied.');
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
