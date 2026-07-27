import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrincipalResolver } from '../auth/auth.contracts';
import { SecurityAuditService } from '../audit/security-audit.service';
import { setCurrentUser } from '../context/request-context';
import { IS_PUBLIC_KEY } from '../decorators/metadata.keys';
import { JwtService } from '../jwt/jwt.service';

/**
 * Verifies the bearer token and attaches the caller to the request.
 *
 * Intended to be registered globally via `APP_GUARD`, so authentication is the
 * default and {@link Public} is the explicit exception. Also writes the user
 * into the ambient {@link RequestContext}, which is what lets logging and
 * automatic audit columns know who is acting without any plumbing.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly principalResolver: PrincipalResolver,
    @Optional() private readonly audit?: SecurityAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const token = JwtAuthGuard.extractBearerToken(request);
    if (!token) {
      await this.audit?.tokenRejected('No bearer token supplied.');
      throw new UnauthorizedException('Authentication required');
    }

    // `verify` already throws UnauthorizedException with a generic message;
    // the specific reason stays in the audit trail only.
    const claims = await this.jwtService.verify(token, 'access');
    const user = await this.principalResolver.resolve(claims);

    request.user = user;
    setCurrentUser(user);
    return true;
  }

  private static extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}
