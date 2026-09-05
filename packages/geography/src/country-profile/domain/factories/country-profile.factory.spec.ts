import { FixedClock, SequentialIdGenerator } from '@nafa/shared';
import { AdministrativeLevel } from '../administrative-level.vo';
import { createCountryProfile } from './country-profile.factory';
import { CountryProfileStatus } from '../country-profile-status.vo';
import { GeographyRule } from '../country-profile.errors';

const clock = new FixedClock(new Date('2026-01-15T10:00:00Z'));
const ids = new SequentialIdGenerator();

describe('createCountryProfile', () => {
  it('creates a Guinean profile with 4 levels from plain inputs', () => {
    const result = createCountryProfile({
      countryCode: 'GN',
      levels: [
        {
          level: AdministrativeLevel.LEVEL_1,
          singular: 'Région',
          plural: 'Régions',
        },
        {
          level: AdministrativeLevel.LEVEL_2,
          singular: 'Préfecture',
          plural: 'Préfectures',
        },
        {
          level: AdministrativeLevel.LEVEL_3,
          singular: 'Sous-préfecture',
          plural: 'Sous-préfectures',
        },
        {
          level: AdministrativeLevel.LEVEL_4,
          singular: 'District',
          plural: 'Districts',
        },
      ],
      clock,
      ids,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.countryCode).toBe('GN');
    expect(result.value.status).toBe(CountryProfileStatus.DRAFT);
    expect(result.value.levels).toHaveLength(4);
    expect(result.value.pullEvents()).toHaveLength(1);
  });

  it('creates a Liberian profile with 3 levels', () => {
    const result = createCountryProfile({
      countryCode: 'LR',
      levels: [
        {
          level: AdministrativeLevel.LEVEL_1,
          singular: 'County',
          plural: 'Counties',
        },
        {
          level: AdministrativeLevel.LEVEL_2,
          singular: 'District',
          plural: 'Districts',
        },
        {
          level: AdministrativeLevel.LEVEL_3,
          singular: 'Clan',
          plural: 'Clans',
        },
      ],
      clock,
      ids,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.levels).toHaveLength(3);
  });

  it('propagates an invalid country code', () => {
    const result = createCountryProfile({
      countryCode: 'INVALID',
      levels: [],
      clock,
      ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_COUNTRY_CODE);
    }
  });

  it('propagates an empty label', () => {
    const result = createCountryProfile({
      countryCode: 'GN',
      levels: [
        { level: AdministrativeLevel.LEVEL_1, singular: '', plural: 'Régions' },
      ],
      clock,
      ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_LABEL);
    }
  });

  it('propagates non-contiguous levels', () => {
    const result = createCountryProfile({
      countryCode: 'GN',
      levels: [
        {
          level: AdministrativeLevel.LEVEL_1,
          singular: 'Région',
          plural: 'Régions',
        },
        {
          level: AdministrativeLevel.LEVEL_3,
          singular: 'Sous-préfecture',
          plural: 'Sous-préfectures',
        },
      ],
      clock,
      ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.LEVELS_NOT_CONTIGUOUS);
    }
  });
});
