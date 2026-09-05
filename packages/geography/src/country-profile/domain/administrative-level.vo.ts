/**
 * Ordered levels of an administrative division.
 *
 * Generic on purpose — a Guinean enum (Region / Prefecture / …) would not
 * survive the first Malian actor.  See ADR-0009 §5.
 *
 * `COUNTRY` is not a level you register areas at; it identifies the profile
 * itself.  The four `LEVEL_*` values are what `AdministrativeArea.level` holds.
 */
export enum AdministrativeLevel {
  COUNTRY = 'COUNTRY',
  LEVEL_1 = 'LEVEL_1',
  LEVEL_2 = 'LEVEL_2',
  LEVEL_3 = 'LEVEL_3',
  LEVEL_4 = 'LEVEL_4',
}

/**
 * The four registerable levels, in ascending order.
 *
 * Used to validate contiguity: a profile declaring LEVEL_1 and LEVEL_3
 * without LEVEL_2 must be refused.
 */
export const REGISTERABLE_LEVELS: readonly AdministrativeLevel[] = [
  AdministrativeLevel.LEVEL_1,
  AdministrativeLevel.LEVEL_2,
  AdministrativeLevel.LEVEL_3,
  AdministrativeLevel.LEVEL_4,
] as const;

/**
 * Numeric rank for comparison.
 *
 * COUNTRY = 0, LEVEL_1 = 1, … LEVEL_4 = 4.
 */
export function levelRank(level: AdministrativeLevel): number {
  switch (level) {
    case AdministrativeLevel.COUNTRY:
      return 0;
    case AdministrativeLevel.LEVEL_1:
      return 1;
    case AdministrativeLevel.LEVEL_2:
      return 2;
    case AdministrativeLevel.LEVEL_3:
      return 3;
    case AdministrativeLevel.LEVEL_4:
      return 4;
  }
}
