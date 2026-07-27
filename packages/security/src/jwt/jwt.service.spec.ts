import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtService } from './jwt.service';
import { JwtKeyStore } from './key-store';
import type { JwtOptions, JwtSigningKey } from './jwt.types';

const OPTIONS: JwtOptions = {
  issuer: 'nafa',
  audience: 'nafa-api',
  accessTokenTtl: 900,
  refreshTokenTtl: 1_209_600,
};

const KEY_V1: JwtSigningKey = {
  kid: 'k1',
  algorithm: 'HS256',
  privateKey: 'a-test-secret-long-enough-for-hs256-signing',
  active: true,
};

const KEY_V2: JwtSigningKey = {
  kid: 'k2',
  algorithm: 'HS256',
  privateKey: 'a-second-test-secret-long-enough-for-hs256',
  active: true,
};

const USER: AuthenticatedUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'user@nafa.gn',
  roles: ['admin'],
  permissions: ['shipment:*'],
};

function serviceWith(keys: JwtSigningKey[]): JwtService {
  return new JwtService(new JwtKeyStore(keys), OPTIONS);
}

describe('JwtService', () => {
  const service = serviceWith([KEY_V1]);

  it('issues an access token that verifies and carries the claims', async () => {
    const token = await service.signAccessToken(USER);
    const claims = await service.verify(token, 'access');

    expect(claims.sub).toBe('user-1');
    expect(claims.tid).toBe('tenant-1');
    expect(claims.roles).toEqual(['admin']);
    expect(claims.perms).toEqual(['shipment:*']);
    expect(claims.iss).toBe('nafa');
    expect(claims.aud).toBe('nafa-api');
  });

  it('issues a token pair with the advertised lifetime', async () => {
    const pair = await service.issueTokenPair(USER);
    expect(pair.tokenType).toBe('Bearer');
    expect(pair.expiresIn).toBe(OPTIONS.accessTokenTtl);
    await expect(
      service.verify(pair.accessToken, 'access'),
    ).resolves.toBeDefined();
    await expect(
      service.verify(pair.refreshToken, 'refresh'),
    ).resolves.toBeDefined();
  });

  // A refresh token accepted as an access token would be a privilege
  // escalation path, since refresh tokens live far longer.
  it('refuses a refresh token presented as an access token', async () => {
    const pair = await service.issueTokenPair(USER);
    await expect(
      service.verify(pair.refreshToken, 'access'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps roles and permissions out of the refresh token', async () => {
    const pair = await service.issueTokenPair(USER);
    const claims = await service.verify(pair.refreshToken, 'refresh');
    expect(claims.roles).toBeUndefined();
    expect(claims.perms).toBeUndefined();
  });

  it('rejects a garbage token', async () => {
    await expect(service.verify('not.a.token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with an unknown key', async () => {
    const foreign = serviceWith([{ ...KEY_V2, kid: 'unknown-kid' }]);
    const token = await foreign.signAccessToken(USER);
    await expect(service.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token whose kid is known but signature is not', async () => {
    // Same kid, different secret: the signature must not validate.
    const impostor = serviceWith([
      { ...KEY_V1, privateKey: 'a-different-secret-entirely-here' },
    ]);
    const token = await impostor.signAccessToken(USER);
    await expect(service.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('key rotation', () => {
    it('still verifies tokens signed by a retired key', async () => {
      // Token issued while k1 was the signing key...
      const oldToken = await serviceWith([KEY_V1]).signAccessToken(USER);

      // ...then k2 takes over and k1 is retired but kept for verification.
      const rotated = serviceWith([
        { ...KEY_V1, active: false },
        { ...KEY_V2, active: true },
      ]);

      await expect(rotated.verify(oldToken)).resolves.toMatchObject({
        sub: 'user-1',
      });
    });

    it('signs new tokens with the active key', async () => {
      const rotated = serviceWith([
        { ...KEY_V1, active: false },
        { ...KEY_V2, active: true },
      ]);
      const token = await rotated.signAccessToken(USER);

      const [header] = token.split('.');
      const decoded = JSON.parse(
        Buffer.from(header, 'base64url').toString('utf8'),
      );
      expect(decoded.kid).toBe('k2');
    });

    it('stops verifying once the retired key is removed', async () => {
      const oldToken = await serviceWith([KEY_V1]).signAccessToken(USER);
      const rotated = serviceWith([{ ...KEY_V2, active: true }]);
      await expect(rotated.verify(oldToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});

describe('JwtKeyStore', () => {
  it('requires at least one key', () => {
    expect(() => new JwtKeyStore([])).toThrow(/at least one/i);
  });

  it('rejects two active keys as ambiguous', () => {
    expect(() => new JwtKeyStore([KEY_V1, KEY_V2])).toThrow(/exactly one/i);
  });

  it('rejects zero active keys', () => {
    expect(() => new JwtKeyStore([{ ...KEY_V1, active: false }])).toThrow(
      /exactly one/i,
    );
  });

  it('finds a retired key by kid', () => {
    const store = new JwtKeyStore([
      { ...KEY_V1, active: false },
      { ...KEY_V2, active: true },
    ]);
    expect(store.findByKid('k1')?.kid).toBe('k1');
    expect(store.signingKey.kid).toBe('k2');
    expect(store.all()).toHaveLength(2);
  });
});
