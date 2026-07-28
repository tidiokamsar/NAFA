import {
  err,
  flatMapResult,
  isErr,
  isOk,
  mapResult,
  ok,
  unwrap,
  unwrapOr,
} from './result';

describe('Result', () => {
  it('narrows a success', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) expect(result.value).toBe(42);
  });

  it('narrows a failure', () => {
    const result = err(new Error('boom'));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.message).toBe('boom');
  });

  it('maps over a success', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
  });

  it('leaves a failure untouched when mapping', () => {
    const failure = err('nope');
    const mapper = jest.fn();
    expect(mapResult(failure, mapper)).toBe(failure);
    expect(mapper).not.toHaveBeenCalled();
  });

  it('chains with flatMap', () => {
    const parse = (value: string) =>
      Number.isNaN(Number(value)) ? err('not a number') : ok(Number(value));

    expect(flatMapResult(ok('7'), parse)).toEqual({ ok: true, value: 7 });
    expect(flatMapResult(ok('x'), parse)).toEqual({
      ok: false,
      error: 'not a number',
    });
  });

  it('falls back with unwrapOr', () => {
    expect(unwrapOr(ok(1), 99)).toBe(1);
    expect(unwrapOr(err('bad'), 99)).toBe(99);
  });

  it('unwraps a success', () => {
    expect(unwrap(ok('value'))).toBe('value');
  });

  it('throws the original error when unwrapping a failure', () => {
    const original = new Error('original');
    expect(() => unwrap(err(original))).toThrow(original);
  });

  it('wraps a non-Error failure before throwing', () => {
    expect(() => unwrap(err('plain string'))).toThrow('plain string');
  });
});
