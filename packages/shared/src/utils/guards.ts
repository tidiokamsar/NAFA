import type { Optional } from '../types/primitives';

/**
 * Narrows out null and undefined. Useful as an array filter, where
 * `.filter(Boolean)` does not narrow the type.
 *
 * ```ts
 * const ids: string[] = maybeIds.filter(isDefined);
 * ```
 */
export function isDefined<T>(value: Optional<T>): value is T {
  return value !== null && value !== undefined;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Exhaustiveness check for discriminated unions.
 *
 * Put it in the `default` branch of a switch: adding a variant then becomes a
 * compile error at every switch that forgot it, instead of a silent fallthrough
 * discovered in production.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(
    message ?? `Unhandled variant: ${JSON.stringify(value as unknown)}`,
  );
}
