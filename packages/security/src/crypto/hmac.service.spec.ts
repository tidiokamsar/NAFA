import { HmacService } from './hmac.service';

describe('HmacService', () => {
  const hmac = new HmacService();
  const secret = 'shared-webhook-secret';

  it('produces a stable signature for the same input', () => {
    expect(hmac.sign('payload', secret)).toBe(hmac.sign('payload', secret));
  });

  it('produces a different signature for a different payload', () => {
    expect(hmac.sign('a', secret)).not.toBe(hmac.sign('b', secret));
  });

  it('produces a different signature under a different secret', () => {
    expect(hmac.sign('payload', 'one')).not.toBe(hmac.sign('payload', 'two'));
  });

  it('verifies a genuine signature', () => {
    const signature = hmac.sign('payload', secret);
    expect(hmac.verify('payload', signature, secret)).toBe(true);
  });

  it('rejects a signature for a modified payload', () => {
    const signature = hmac.sign('payload', secret);
    expect(hmac.verify('payload-tampered', signature, secret)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const signature = hmac.sign('payload', 'other-secret');
    expect(hmac.verify('payload', signature, secret)).toBe(false);
  });

  it('rejects a malformed signature without throwing', () => {
    expect(hmac.verify('payload', 'not-a-signature', secret)).toBe(false);
  });
});
