import { JwtService } from '@nestjs/jwt';
import type { IdentityUser } from '../../domain';
import { JwtAccessTokenIssuer } from './jwt-access-token.issuer';

describe('JwtAccessTokenIssuer', () => {
  const user: IdentityUser = {
    id: 'u1',
    email: 'user@nafa.gn',
    passwordHash: 'stored-hash',
  };

  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;
  let issuer: JwtAccessTokenIssuer;

  beforeEach(() => {
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    issuer = new JwtAccessTokenIssuer(jwtService as unknown as JwtService);
  });

  it('signs the payload JwtStrategy reads back', () => {
    // { sub, email } is what every already-issued token carries and what
    // JwtStrategy.validate() destructures. Changing it invalidates live
    // sessions without anything failing loudly.
    issuer.issueFor(user);

    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'u1',
      email: 'user@nafa.gn',
    });
  });

  it('never puts the password hash in the token', () => {
    issuer.issueFor(user);

    const [payload] = jwtService.sign.mock.calls[0];
    expect(JSON.stringify(payload)).not.toContain('stored-hash');
  });

  it('returns the token under the accessToken key', () => {
    // The response shape is public API: clients read `accessToken`.
    expect(issuer.issueFor(user)).toEqual({ accessToken: 'signed.jwt.token' });
  });
});
