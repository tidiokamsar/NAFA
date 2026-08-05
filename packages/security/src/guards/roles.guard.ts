import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser, Role } from '../auth/auth.types';
import { SecurityAuditService } from '../audit/security-audit.service';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/metadata.keys';
import { RbacService } from '../rbac/rbac.service';

/**
 * Enforces {@link Roles}. Runs after {@link JwtAuthGuard}, which is what puts
 * the user on the request.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
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

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user || !this.rbac.hasAnyRole(user, required)) {
      const action = `${request.method} ${request.route?.path ?? request.url}`;
      await this.audit?.roleDenied(
        action,
        `Requires one of: ${required.join(', ')}`,
      );
      // Same opaque message whatever the reason: telling a caller which role
      // they lack maps out the permission model for them.
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
