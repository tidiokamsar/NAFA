import { REDACTED, redact } from './redact';

describe('redact', () => {
  it('redacts a password field', () => {
    expect(redact({ email: 'a@b.gn', password: 'hunter2' })).toEqual({
      email: 'a@b.gn',
      password: REDACTED,
    });
  });

  it('matches regardless of case or separators', () => {
    const output = redact({
      PASSWORD: 'x',
      password_hash: 'y',
      'api-key': 'z',
      apiKey: 'w',
    });
    expect(Object.values(output)).toEqual([
      REDACTED,
      REDACTED,
      REDACTED,
      REDACTED,
    ]);
  });

  it('matches on substring, so prefixed fields are caught', () => {
    expect(redact({ userPassword: 'x', refreshToken: 'y' })).toEqual({
      userPassword: REDACTED,
      refreshToken: REDACTED,
    });
  });

  it('leaves non-sensitive fields untouched', () => {
    const input = { id: '1', name: 'Conakry', count: 3, active: true };
    expect(redact(input)).toEqual(input);
  });

  it('recurses into nested objects', () => {
    expect(redact({ user: { name: 'a', secret: 'b' } })).toEqual({
      user: { name: 'a', secret: REDACTED },
    });
  });

  it('recurses into arrays', () => {
    expect(redact([{ token: 'a' }, { token: 'b' }])).toEqual([
      { token: REDACTED },
      { token: REDACTED },
    ]);
  });

  it('does not mutate the input', () => {
    const input = { password: 'hunter2' };
    redact(input);
    expect(input.password).toBe('hunter2');
  });

  // A cyclic object would otherwise recurse forever.
  it('stops at the depth limit instead of looping', () => {
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic.self = cyclic;
    expect(() => redact(cyclic)).not.toThrow();
  });

  it('passes primitives through', () => {
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
  });
});
