import { isErr, isOk } from './result';
import { isoDate } from './iso-date';

describe('isoDate', () => {
  it('accepts a well-formed calendar date', () => {
    const result = isoDate('1985-03-17', 'Birth date');
    expect(isOk(result)).toBe(true);
    if (result.ok) expect(result.value).toBe('1985-03-17');
  });

  it('rejects a value that matches the shape but is not a real date', () => {
    // 2025-02-30 matches the pattern; Date would roll it to March. The
    // round-trip check is what catches it.
    const result = isoDate('2025-02-30', 'Birth date');
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error.message).toMatch(/real date/);
  });

  it('rejects a malformed value', () => {
    const result = isoDate('17/03/1985', 'Birth date');
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error.message).toMatch(/YYYY-MM-DD/);
  });

  it('trims surrounding whitespace before checking the shape', () => {
    const result = isoDate('  1985-03-17  ', 'Birth date');
    expect(isOk(result)).toBe(true);
    if (result.ok) expect(result.value).toBe('1985-03-17');
  });

  it('mentions the field label in the error message', () => {
    const result = isoDate('not-a-date', 'Incorporation date');
    expect(isErr(result)).toBe(true);
    if (!result.ok)
      expect(result.error.message).toContain('Incorporation date');
  });
});
