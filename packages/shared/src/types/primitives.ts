/** Small type helpers used across the codebase. */

export type Nullable<T> = T | null;
export type Maybe<T> = T | undefined;
export type Optional<T> = T | null | undefined;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

/**
 * A nominal type, so two ids that are both strings cannot be swapped by
 * mistake:
 *
 * ```ts
 * type ActorId = Brand<string, 'ActorId'>;
 * type OrderId = Brand<string, 'OrderId'>;
 * // passing an OrderId where an ActorId is expected is a compile error
 * ```
 */
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

/** ISO 8601 calendar date, `YYYY-MM-DD`, with no time and no zone. */
export type IsoDate = Brand<string, 'IsoDate'>;

/** ISO 8601 timestamp, e.g. `2026-07-27T10:15:30.000Z`. */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;

/** RFC 4122 UUID. */
export type Uuid = Brand<string, 'Uuid'>;

export type UnknownRecord = Record<string, unknown>;

/** Every key of T whose value is assignable to V. */
export type KeysOfType<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

/** Makes the listed keys required, leaving the rest untouched. */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;
