import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser, Permission } from '../auth/auth.types';
import { SecurityAuditService } from '../audit/security-audit.service';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators/metadata.keys';
import { RbacService } from '../rbac/rbac.service';

/**
 * Enforces {@link Permissions} — every listed permission must be held.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
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

    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user || !this.rbac.hasAllPermissions(user, required)) {
      const action = `${request.method} ${request.route?.path ?? request.url}`;
      await this.audit?.permissionDenied(
        action,
        `Requires all of: ${required.join(', ')}`,
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
