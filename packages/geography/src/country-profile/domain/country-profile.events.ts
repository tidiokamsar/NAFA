import type { CountryProfileStatus } from './country-profile-status.vo';
import type { CountryCode } from './country-code.vo';
import type { LevelDefinition } from './level-definition.vo';

/**
 * What the CountryProfile aggregate announces.
 *
 * Naming: `<aggregate>.<past-tense verb>`.  Past tense because an event
 * reports something that has happened — a consumer cannot refuse it.
 */
export const CountryProfileEventType = {
  REGISTERED: 'country-profile.registered',
  LEVELS_CHANGED: 'country-profile.levels-changed',
  PUBLISHED: 'country-profile.published',
  DEPRECATED: 'country-profile.deprecated',
} as const;

export type CountryProfileEventType =
  (typeof CountryProfileEventType)[keyof typeof CountryProfileEventType];

/** Every CountryProfile event names its aggregate the same way. */
export const COUNTRY_PROFILE_AGGREGATE = 'CountryProfile';

export interface CountryProfileRegisteredPayload {
  countryCode: CountryCode;
  status: CountryProfileStatus;
  levels: readonly LevelDefinition[];
}

export interface CountryProfileLevelsChangedPayload {
  countryCode: CountryCode;
  previousLevels: readonly LevelDefinition[];
  newLevels: readonly LevelDefinition[];
}

export interface CountryProfileStatusChangedPayload {
  countryCode: CountryCode;
  from: CountryProfileStatus;
  to: CountryProfileStatus;
}
