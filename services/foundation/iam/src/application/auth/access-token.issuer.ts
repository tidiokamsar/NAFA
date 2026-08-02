import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { IdentityUser } from '../../domain';
import { AuthTokens } from './auth-tokens';

/**
 * The single place the access-token payload is defined.
 *
 * Register and login both hand out a token; if each built its own payload they
 * would drift, and a token minted at signup would stop matching one minted at
 * login without anything failing loudly.
 */
@Injectable()
export class AccessTokenIssuer {
  constructor(private readonly jwtService: JwtService) {}

  issueFor(user: IdentityUser): AuthTokens {
    return {
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
    };
  }
}
