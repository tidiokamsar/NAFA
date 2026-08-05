import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import type {
  AuthenticatedUser,
  NafaJwtClaims,
  TokenPair,
  TokenType,
} from '../auth/auth.types';
import { JwtKeyStore } from './key-store';
import { JWT_OPTIONS, type JwtOptions, type JwtSigningKey } from './jwt.types';

type CryptoKeyLike = Parameters<SignJWT['sign']>[0];

/**
 * Issues and verifies NAFA access and refresh tokens.
 *
 * Built on `jose` rather than `jsonwebtoken` because key rotation needs `kid`
 * handling and JWKS support as first-class features.
 *
 * Independent of IAM: it turns claims into tokens and back. Deciding *which*
 * claims a user gets is the issuing service's job.
 */
@Injectable()
export class JwtService {
  private readonly keyCache = new Map<string, CryptoKeyLike>();

  constructor(
    private readonly keyStore: JwtKeyStore,
    @Inject(JWT_OPTIONS) private readonly options: JwtOptions,
  ) {}

  /** Issues an access + refresh pair for an authenticated user. */
  async issueTokenPair(user: AuthenticatedUser): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.sign(this.accessClaims(user), 'access', this.options.accessTokenTtl),
      // The refresh token carries identity only. Roles and permissions are
      // re-read at refresh time, so a revoked role cannot be resurrected by
      // replaying an old refresh token.
      this.sign(
        { sub: user.id, tid: user.tenantId },
        'refresh',
        this.options.refreshTokenTtl,
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.options.accessTokenTtl,
      tokenType: 'Bearer',
    };
  }

  /** Signs an access token only. */
  signAccessToken(user: AuthenticatedUser): Promise<string> {
    return this.sign(
      this.accessClaims(user),
      'access',
      this.options.accessTokenTtl,
    );
  }

  /**
   * Verifies a token and returns its claims.
   *
   * @param expectedType rejects a refresh token presented as an access token,
   *   which would otherwise be a privilege-escalation path.
   * @throws UnauthorizedException on any invalid, expired or mistyped token.
   */
  async verify(
    token: string,
    expectedType: TokenType = 'access',
  ): Promise<NafaJwtClaims> {
    try {
      const { payload } = await jwtVerify(
        token,
        async (header) => {
          if (!header.kid) {
            throw new Error('Token header carries no kid.');
          }
          const key = this.keyStore.findByKid(header.kid);
          if (!key) {
            throw new Error(`Unknown key id: ${header.kid}`);
          }
          return this.verificationKey(key);
        },
        {
          issuer: this.options.issuer,
          audience: this.options.audience,
          clockTolerance: this.options.clockToleranceSeconds ?? 5,
        },
      );

      const claims = payload as unknown as NafaJwtClaims;
      if (claims.typ !== expectedType) {
        throw new Error(
          `Expected a ${expectedType} token, received ${claims.typ ?? 'untyped'}.`,
        );
      }
      return claims;
    } catch (error) {
      // Never surface the underlying reason to the caller: it tells an
      // attacker whether a token was merely expired or outright forged.
      throw new UnauthorizedException('Invalid or expired token', {
        cause: error as Error,
      });
    }
  }

  private accessClaims(user: AuthenticatedUser): Partial<NafaJwtClaims> {
    return {
      sub: user.id,
      tid: user.tenantId,
      email: user.email,
      roles: [...user.roles],
      perms: [...user.permissions],
      attrs: user.attributes as Record<string, unknown> | undefined,
    };
  }

  private async sign(
    claims: Partial<NafaJwtClaims>,
    type: TokenType,
    ttlSeconds: number,
  ): Promise<string> {
    const key = this.keyStore.signingKey;
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({ ...claims, typ: type })
      .setProtectedHeader({ alg: key.algorithm, kid: key.kid })
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setIssuedAt(now)
      .setExpirationTime(now + ttlSeconds)
      .setJti(randomUUID())
      .sign(await this.signingKeyMaterial(key));
  }

  private async signingKeyMaterial(key: JwtSigningKey): Promise<CryptoKeyLike> {
    const cacheKey = `sign:${key.kid}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached) return cached;

    const material: CryptoKeyLike =
      key.algorithm === 'HS256'
        ? (new TextEncoder().encode(key.privateKey) as CryptoKeyLike)
        : ((await importPKCS8(key.privateKey, key.algorithm)) as CryptoKeyLike);

    this.keyCache.set(cacheKey, material);
    return material;
  }

  private async verificationKey(key: JwtSigningKey): Promise<CryptoKeyLike> {
    const cacheKey = `verify:${key.kid}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached) return cached;

    let material: CryptoKeyLike;
    if (key.algorithm === 'HS256') {
      material = new TextEncoder().encode(key.privateKey) as CryptoKeyLike;
    } else {
      if (!key.publicKey) {
        throw new Error(`Key ${key.kid} (${key.algorithm}) has no publicKey.`);
      }
      material = (await importSPKI(
        key.publicKey,
        key.algorithm,
      )) as CryptoKeyLike;
    }

    this.keyCache.set(cacheKey, material);
    return material;
  }
}
