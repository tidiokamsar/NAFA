import { isPlainObject } from './guards';

/**
 * Field names never to write to a log, an audit event or an error payload.
 * Matched case-insensitively, on substring, so `userPassword` and
 * `PASSWORD_HASH` are both caught.
 */
export const SENSITIVE_FIELD_PATTERNS = [
  'password',
  'passwordhash',
  'secret',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'creditcard',
  'cardnumber',
  'cvv',
  'pin',
  'ssn',
] as const;

export const REDACTED = '[redacted]';

function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[-_\s]/g, '');
  return SENSITIVE_FIELD_PATTERNS.some((pattern) =>
    normalised.includes(pattern.replace(/[-_]/g, '')),
  );
}

/**
 * Returns a deep copy with sensitive values replaced.
 *
 * Applied before anything user-supplied reaches a log or an audit record —
 * the usual way a password ends up in a log file is a whole request body being
 * dumped on error.
 *
 * @param depth guards against cycles and pathological nesting; deeper values
 *   are dropped rather than followed.
 */
export function redact<T>(value: T, depth = 8): T {
  if (depth <= 0) return REDACTED as unknown as T;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth - 1)) as unknown as T;
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redact(item, depth - 1);
    }
    return output as unknown as T;
  }

  return value;
}
