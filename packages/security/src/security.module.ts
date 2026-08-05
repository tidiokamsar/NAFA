import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { PolicyEngine } from './abac/policy-engine.service';
import type { Policy } from './abac/policy.types';
import {
  ClaimsPrincipalResolver,
  PrincipalResolver,
} from './auth/auth.contracts';
import {
  LoggerSecurityAuditSink,
  SecurityAuditService,
} from './audit/security-audit.service';
import { SecurityAuditSink } from './audit/security-event.types';
import { EncryptionService } from './crypto/encryption.service';
import { HashingService } from './crypto/hashing.service';
import { HmacService } from './crypto/hmac.service';
import { JwtService } from './jwt/jwt.service';
import { JwtKeyStore } from './jwt/key-store';
import {
  JWT_KEYS,
  JWT_OPTIONS,
  type JwtOptions,
  type JwtSigningKey,
} from './jwt/jwt.types';
import { RbacService } from './rbac/rbac.service';

export interface SecurityModuleOptions {
  jwt: JwtOptions;
  /** Signing keys. Exactly one must be `active`. */
  keys: JwtSigningKey[];
  /** 32-byte base64 or hex key for {@link EncryptionService}. */
  encryptionKey?: string;
  /** ABAC policies to register at boot. */
  policies?: Policy<any>[];
  /**
   * Replaces {@link ClaimsPrincipalResolver} when roles or permissions must be
   * re-read from a store rather than trusted from the token.
   */
  principalResolver?: Type<PrincipalResolver>;
  /** Replaces {@link LoggerSecurityAuditSink}, e.g. to ship to a SIEM. */
  auditSink?: Type<SecurityAuditSink>;
}

/**
 * Wires the security library into a service.
 *
 * Global, because guards and decorators are used everywhere and re-importing
 * this in each feature module would be noise.
 *
 * It installs **no global guard**: which routes are protected is a decision
 * per service, so the service registers `APP_GUARD` itself. The recommended
 * setup is `JwtAuthGuard` globally plus `@Public()` on the exceptions.
 *
 * ```ts
 * SecurityModule.forRoot({
 *   jwt: { issuer: 'nafa', audience: 'nafa-api',
 *          accessTokenTtl: 900, refreshTokenTtl: 1209600 },
 *   keys: [{ kid: 'k1', algorithm: 'HS256',
 *            privateKey: process.env.JWT_SECRET!, active: true }],
 * })
 * ```
 */
@Module({})
export class SecurityModule {
  static forRoot(options: SecurityModuleOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: JWT_OPTIONS, useValue: options.jwt },
      { provide: JWT_KEYS, useValue: options.keys },
      JwtKeyStore,
      JwtService,
      RbacService,
      HashingService,
      HmacService,
      SecurityAuditService,

      {
        provide: PrincipalResolver,
        ...(options.principalResolver
          ? { useClass: options.principalResolver }
          : { useClass: ClaimsPrincipalResolver }),
      },
      {
        provide: SecurityAuditSink,
        ...(options.auditSink
          ? { useClass: options.auditSink }
          : { useClass: LoggerSecurityAuditSink }),
      },
      {
        provide: PolicyEngine,
        useFactory: () => {
          const engine = new PolicyEngine();
          engine.registerAll(options.policies ?? []);
          return engine;
        },
      },
    ];

    // Only offered when a key is configured: an EncryptionService with no key
    // cannot be constructed, and failing at injection is clearer than
    // silently providing something unusable.
    if (options.encryptionKey) {
      const key = options.encryptionKey;
      providers.push({
        provide: EncryptionService,
        useFactory: () => new EncryptionService(key),
      });
    }

    return {
      module: SecurityModule,
      global: true,
      providers,
      exports: providers
        .map((provider) =>
          typeof provider === 'function' ? provider : provider.provide,
        )
        .filter((token): token is NonNullable<typeof token> => Boolean(token)),
    };
  }
}
