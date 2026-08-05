import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenIssuer, AuthTokens } from '../../application';
import type { IdentityUser } from '../../domain';

/**
 * The single place the access-token payload is defined.
 *
 * `{ sub, email }` is the shape `JwtStrategy.validate` reads back, and the one
 * every already-issued token carries. Changing it silently invalidates live
 * sessions, so it is defined once here rather than at each call site.
 */
@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  constructor(private readonly jwtService: JwtService) {}

  issueFor(user: IdentityUser): AuthTokens {
    return {
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
    };
  }
}
