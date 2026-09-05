import { FixedClock, SequentialIdGenerator } from '@nafa/shared';
import { AdministrativeLevel, levelRank } from './administrative-level.vo';
import { levelLabel, levelDefinition } from './level-definition.vo';
import { countryCode } from './country-code.vo';
import {
  CountryProfileStatus,
  checkCountryProfileTransition,
} from './country-profile-status.vo';
import { GeographyRule } from './country-profile.errors';
import {
  CountryProfile,
  type RegisterCountryProfileInput,
} from './country-profile.aggregate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clock = new FixedClock(new Date('2026-01-15T10:00:00Z'));
const ids = new SequentialIdGenerator();
const deps = { clock, ids };

/** Unwrap a Result throwing on failure — only for test helpers with known-valid data. */
function expectOk<T, E>(
  result: { readonly ok: boolean; readonly value?: T; readonly error?: E },
  msg: string,
): T {
  if (result.ok) return result.value!;
  throw new Error(`${msg}: ${result.error}`);
}

/** Builds a valid Guinea profile input with 4 levels (Region, Prefecture, Sous-préfecture, District). */
function guineaInput(): RegisterCountryProfileInput {
  const code = expectOk(countryCode('GN'), 'countryCode GN');
  const levels = [
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      }),
      'level 1',
    ),
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_2,
        label: { singular: 'Préfecture', plural: 'Préfectures' },
      }),
      'level 2',
    ),
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_3,
        label: { singular: 'Sous-préfecture', plural: 'Sous-préfectures' },
      }),
      'level 3',
    ),
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_4,
        label: { singular: 'District', plural: 'Districts' },
      }),
      'level 4',
    ),
  ];
  return { countryCode: code, levels };
}

/** Builds a valid Liberia profile input with 3 levels (County, District, Clan). */
function liberiaInput(): RegisterCountryProfileInput {
  const code = expectOk(countryCode('LR'), 'countryCode LR');
  const levels = [
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'County', plural: 'Counties' },
      }),
      'level 1',
    ),
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_2,
        label: { singular: 'District', plural: 'Districts' },
      }),
      'level 2',
    ),
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_3,
        label: { singular: 'Clan', plural: 'Clans' },
      }),
      'level 3',
    ),
  ];
  return { countryCode: code, levels };
}

// ===========================================================================
// AdministrativeLevel
// ===========================================================================

describe('AdministrativeLevel', () => {
  it('orders levels correctly', () => {
    expect(levelRank(AdministrativeLevel.COUNTRY)).toBe(0);
    expect(levelRank(AdministrativeLevel.LEVEL_1)).toBe(1);
    expect(levelRank(AdministrativeLevel.LEVEL_2)).toBe(2);
    expect(levelRank(AdministrativeLevel.LEVEL_3)).toBe(3);
    expect(levelRank(AdministrativeLevel.LEVEL_4)).toBe(4);
  });
});

// ===========================================================================
// countryCode VO
// ===========================================================================

describe('countryCode', () => {
  it('accepts a valid ISO 3166-1 alpha-2 code', () => {
    const result = countryCode('GN');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('GN');
    }
  });

  it('uppercases the input', () => {
    const result = countryCode('gn');
    expect(result.ok && result.value).toBe('GN');
  });

  it('trims whitespace', () => {
    const result = countryCode(' GN ');
    expect(result.ok && result.value).toBe('GN');
  });

  it('rejects a code that is too short', () => {
    const result = countryCode('G');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_COUNTRY_CODE);
    }
  });

  it('rejects a code that is too long', () => {
    const result = countryCode('GIN');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_COUNTRY_CODE);
    }
  });

  it('rejects digits', () => {
    const result = countryCode('12');
    expect(result.ok).toBe(false);
  });

  it('rejects empty string', () => {
    const result = countryCode('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_COUNTRY_CODE);
    }
  });
});

// ===========================================================================
// levelDefinition VO
// ===========================================================================

describe('levelDefinition', () => {
  it('accepts a registerable level with valid labels', () => {
    const result = levelDefinition({
      level: AdministrativeLevel.LEVEL_1,
      label: { singular: 'Région', plural: 'Régions' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects COUNTRY as a registerable level', () => {
    const result = levelDefinition({
      level: AdministrativeLevel.COUNTRY,
      label: { singular: 'Country', plural: 'Countries' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_LEVEL);
    }
  });
});

// ===========================================================================
// levelLabel VO
// ===========================================================================

describe('levelLabel', () => {
  it('accepts non-empty singular and plural', () => {
    const result = levelLabel(
      { singular: 'Région', plural: 'Régions' },
      AdministrativeLevel.LEVEL_1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.singular).toBe('Région');
      expect(result.value.plural).toBe('Régions');
    }
  });

  it('trims whitespace', () => {
    const result = levelLabel(
      { singular: '  Région  ', plural: '  Régions  ' },
      AdministrativeLevel.LEVEL_1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.singular).toBe('Région');
      expect(result.value.plural).toBe('Régions');
    }
  });

  it('rejects empty singular', () => {
    const result = levelLabel(
      { singular: '', plural: 'Régions' },
      AdministrativeLevel.LEVEL_1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_LABEL);
      expect(result.error.message).toContain('Singular');
    }
  });

  it('rejects empty plural', () => {
    const result = levelLabel(
      { singular: 'Région', plural: '' },
      AdministrativeLevel.LEVEL_1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_LABEL);
      expect(result.error.message).toContain('Plural');
    }
  });
});

// ===========================================================================
// CountryProfileStatus
// ===========================================================================

describe('checkCountryProfileTransition', () => {
  it('allows DRAFT → PUBLISHED', () => {
    const result = checkCountryProfileTransition(
      CountryProfileStatus.DRAFT,
      CountryProfileStatus.PUBLISHED,
    );
    expect(result.ok).toBe(true);
  });

  it('allows PUBLISHED → DEPRECATED', () => {
    const result = checkCountryProfileTransition(
      CountryProfileStatus.PUBLISHED,
      CountryProfileStatus.DEPRECATED,
    );
    expect(result.ok).toBe(true);
  });

  it('forbids PUBLISHED → DRAFT', () => {
    const result = checkCountryProfileTransition(
      CountryProfileStatus.PUBLISHED,
      CountryProfileStatus.DRAFT,
    );
    expect(result.ok).toBe(false);
  });

  it('forbids DEPRECATED → anything', () => {
    const result = checkCountryProfileTransition(
      CountryProfileStatus.DEPRECATED,
      CountryProfileStatus.PUBLISHED,
    );
    expect(result.ok).toBe(false);
  });

  it('forbids DRAFT → DEPRECATED', () => {
    const result = checkCountryProfileTransition(
      CountryProfileStatus.DRAFT,
      CountryProfileStatus.DEPRECATED,
    );
    expect(result.ok).toBe(false);
  });

  it('forbids same status', () => {
    const result = checkCountryProfileTransition(
      CountryProfileStatus.DRAFT,
      CountryProfileStatus.DRAFT,
    );
    expect(result.ok).toBe(false);
  });
});

// ===========================================================================
// CountryProfile aggregate
// ===========================================================================

describe('CountryProfile', () => {
  // ---------------------------------------------------------------- register

  describe('register', () => {
    it('registers a Guinean profile with 4 levels', () => {
      const input = guineaInput();
      const result = CountryProfile.register(input, deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const profile = result.value;
      expect(profile.countryCode).toBe('GN');
      expect(profile.status).toBe(CountryProfileStatus.DRAFT);
      expect(profile.levels).toHaveLength(4);
      expect(profile.version).toBe(1);
      expect(profile.expectedVersion).toBe(0);
    });

    it('registers a Liberian profile with 3 levels', () => {
      const input = liberiaInput();
      const result = CountryProfile.register(input, deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.levels).toHaveLength(3);
    });

    it('emits a country-profile.registered event', () => {
      const input = guineaInput();
      const result = CountryProfile.register(input, deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const events = result.value.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('country-profile.registered');
    });

    // Invariant 2: contiguity
    it('rejects levels with a gap (LEVEL_1 and LEVEL_3 without LEVEL_2)', () => {
      const codeResult = countryCode('GN');
      if (!codeResult.ok) throw codeResult.error;

      const l1 = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      });
      if (!l1.ok) throw l1.error;

      const l3 = levelDefinition({
        level: AdministrativeLevel.LEVEL_3,
        label: { singular: 'Sous-préfecture', plural: 'Sous-préfectures' },
      });
      if (!l3.ok) throw l3.error;

      const result = CountryProfile.register(
        { countryCode: codeResult.value, levels: [l1.value, l3.value] },
        deps,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.LEVELS_NOT_CONTIGUOUS);
      }
    });

    // Invariant 3: uniqueness
    it('rejects duplicate levels', () => {
      const codeResult = countryCode('GN');
      if (!codeResult.ok) throw codeResult.error;

      const a = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      });
      if (!a.ok) throw a.error;

      const b = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Province', plural: 'Provinces' },
      });
      if (!b.ok) throw b.error;

      const result = CountryProfile.register(
        { countryCode: codeResult.value, levels: [a.value, b.value] },
        deps,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.DUPLICATE_LEVEL);
      }
    });

    it('accepts a profile with zero levels (DRAFT)', () => {
      const codeResult = countryCode('GN');
      if (!codeResult.ok) throw codeResult.error;

      const result = CountryProfile.register(
        { countryCode: codeResult.value, levels: [] },
        deps,
      );
      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------- lifecycle

  describe('publish', () => {
    it('transitions DRAFT → PUBLISHED', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;

      const result = profile.publish();
      expect(result.ok).toBe(true);
      expect(profile.status).toBe(CountryProfileStatus.PUBLISHED);
    });

    // Invariant 4
    it('rejects publish when profile has no levels', () => {
      const codeResult = countryCode('GN');
      if (!codeResult.ok) throw codeResult.error;

      const regResult = CountryProfile.register(
        { countryCode: codeResult.value, levels: [] },
        deps,
      );
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;

      const result = profile.publish();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.PUBLISHED_REQUIRES_LEVEL);
      }
    });

    it('rejects publish from PUBLISHED (same status)', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.publish();

      const result = profile.publish();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
      }
    });

    it('rejects publish from DEPRECATED', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.publish();
      profile.deprecate();

      const result = profile.publish();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
      }
    });

    it('emits a country-profile.published event', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.pullEvents(); // drain registration event

      profile.publish();
      const events = profile.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('country-profile.published');
    });
  });

  describe('deprecate', () => {
    it('transitions PUBLISHED → DEPRECATED', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.publish();

      const result = profile.deprecate();
      expect(result.ok).toBe(true);
      expect(profile.status).toBe(CountryProfileStatus.DEPRECATED);
    });

    it('rejects deprecate from DRAFT', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;

      const result = profile.deprecate();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
      }
    });

    it('rejects deprecate from DEPRECATED (terminal)', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.publish();
      profile.deprecate();

      const result = profile.deprecate();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
      }
    });

    it('emits a country-profile.deprecated event', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.publish();
      profile.pullEvents(); // drain publish event

      profile.deprecate();
      const events = profile.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('country-profile.deprecated');
    });
  });

  // ---------------------------------------------------------- changeLevels

  describe('changeLevels', () => {
    it('replaces levels and emits event', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.pullEvents();

      const l1 = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      });
      if (!l1.ok) throw l1.error;

      const l2 = levelDefinition({
        level: AdministrativeLevel.LEVEL_2,
        label: { singular: 'Préfecture', plural: 'Préfectures' },
      });
      if (!l2.ok) throw l2.error;

      const result = profile.changeLevels([l1.value, l2.value], new Set());
      expect(result.ok).toBe(true);
      expect(profile.levels).toHaveLength(2);
    });

    // Invariant 2: contiguity on change
    it('rejects non-contiguous new levels', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;

      const l1 = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      });
      if (!l1.ok) throw l1.error;

      const l3 = levelDefinition({
        level: AdministrativeLevel.LEVEL_3,
        label: { singular: 'Sous-préfecture', plural: 'Sous-préfectures' },
      });
      if (!l3.ok) throw l3.error;

      const result = profile.changeLevels([l1.value, l3.value], new Set());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.LEVELS_NOT_CONTIGUOUS);
      }
    });

    // Invariant 7: cannot remove a level that carries areas
    it('rejects removing a level that carries areas', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;

      const l1 = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      });
      if (!l1.ok) throw l1.error;

      const l2 = levelDefinition({
        level: AdministrativeLevel.LEVEL_2,
        label: { singular: 'Préfecture', plural: 'Préfectures' },
      });
      if (!l2.ok) throw l2.error;

      // LEVEL_1 carries areas; we try to keep only LEVEL_2 (not contiguous either,
      // but invariant 7 is checked after contiguity, so we keep both LEVEL_1+2 and
      // claim LEVEL_1 has areas — LEVEL_1 is still present, so this is allowed.
      // Use a proper case: keep LEVEL_1 and LEVEL_2, but LEVEL_1 has areas and we
      // try to remove it → keep only LEVEL_2 which is not contiguous.
      // Better: keep LEVEL_1..3, but LEVEL_1 has areas and we remove it → only LEVEL_2,3
      // which is not contiguous.
      // Simplest valid case: [LEVEL_1, LEVEL_2, LEVEL_3], LEVEL_1 has areas but is
      // still present → ok.  To test rejection: pass levels [LEVEL_2, LEVEL_3] and
      // claim LEVEL_1 has areas.
      const l3 = levelDefinition({
        level: AdministrativeLevel.LEVEL_3,
        label: { singular: 'Sous-préfecture', plural: 'Sous-préfectures' },
      });
      if (!l3.ok) throw l3.error;

      // New levels are [LEVEL_2, LEVEL_3] — not contiguous (missing LEVEL_1).
      // We need contiguous levels where one removal triggers invariant 7.
      // Use [LEVEL_2, LEVEL_3, LEVEL_4] — contiguous — but LEVEL_4 carries areas
      // and we keep it. Not a removal.
      // Use [LEVEL_2, LEVEL_3, LEVEL_4] with LEVEL_4 carrying areas → LEVEL_4 is
      // still present → ok.
      // The right test: keep [LEVEL_1, LEVEL_3, LEVEL_4] → not contiguous, fails before 7.
      // Keep [LEVEL_1, LEVEL_2] (contiguous), LEVEL_3 carries areas and is removed → rejection.
      const areasAtLevel = new Set([AdministrativeLevel.LEVEL_3]);

      const result = profile.changeLevels([l1.value, l2.value], areasAtLevel);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.rule).toBe(GeographyRule.LEVEL_IN_USE);
      }
    });

    it('allows removing a level not carrying areas', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;

      const l1 = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      });
      if (!l1.ok) throw l1.error;

      const l2 = levelDefinition({
        level: AdministrativeLevel.LEVEL_2,
        label: { singular: 'Préfecture', plural: 'Préfectures' },
      });
      if (!l2.ok) throw l2.error;

      const l3 = levelDefinition({
        level: AdministrativeLevel.LEVEL_3,
        label: { singular: 'Sous-préfecture', plural: 'Sous-préfectures' },
      });
      if (!l3.ok) throw l3.error;

      // LEVEL_4 carries areas, but we're removing it; we keep LEVEL_1,2,3.
      // Invariant 7 should NOT fire because LEVEL_4 is the one being removed AND
      // it IS in areasAtLevel → this WOULD fire invariant 7.
      // Fix: LEVEL_4 does NOT carry areas; some other level does.
      const areasAtLevel = new Set([AdministrativeLevel.LEVEL_2]);

      const result = profile.changeLevels(
        [l1.value, l2.value, l3.value],
        areasAtLevel,
      );
      expect(result.ok).toBe(true);
      expect(profile.levels).toHaveLength(3);
    });

    it('emits a country-profile.levels-changed event', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.pullEvents();

      const l1 = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      });
      if (!l1.ok) throw l1.error;

      profile.changeLevels([l1.value], new Set());
      const events = profile.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('country-profile.levels-changed');
    });
  });

  // --------------------------------------------------------------- version

  describe('versioning', () => {
    it('increments version on each mutation', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      expect(profile.version).toBe(1);

      profile.publish();
      expect(profile.version).toBe(2);

      const l1 = levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      });
      if (!l1.ok) throw l1.error;

      profile.changeLevels([l1.value], new Set());
      expect(profile.version).toBe(3);
    });

    it('expectedVersion stays at the loaded version', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      expect(profile.expectedVersion).toBe(0);

      // After a mutation, version moves but expectedVersion does not.
      profile.publish();
      expect(profile.version).toBe(2);
      expect(profile.expectedVersion).toBe(0);
    });

    it('rehydrated profile preserves its version', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.publish();

      const snapshot = profile.snapshot();
      const rehydrated = CountryProfile.rehydrate(snapshot, deps);
      expect(rehydrated.version).toBe(2);
      expect(rehydrated.expectedVersion).toBe(2);
    });
  });

  // -------------------------------------------------------------- rehydrate

  describe('rehydrate', () => {
    it('restores profile from snapshot', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;
      profile.publish();
      profile.pullEvents();

      const snapshot = profile.snapshot();
      const restored = CountryProfile.rehydrate(snapshot, deps);

      expect(restored.countryCode).toBe('GN');
      expect(restored.status).toBe(CountryProfileStatus.PUBLISHED);
      expect(restored.levels).toHaveLength(4);
      expect(restored.version).toBe(2);
      // Rehydration emits no events
      expect(restored.pullEvents()).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------ misc

  describe('accessors', () => {
    it('hasLevel returns true for a declared level', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;

      expect(profile.hasLevel(AdministrativeLevel.LEVEL_1)).toBe(true);
      expect(profile.hasLevel(AdministrativeLevel.LEVEL_3)).toBe(true);
      expect(profile.hasLevel(AdministrativeLevel.COUNTRY)).toBe(false);
    });

    it('levels returns a copy', () => {
      const input = guineaInput();
      const regResult = CountryProfile.register(input, deps);
      if (!regResult.ok) throw regResult.error;
      const profile = regResult.value;

      const copy = profile.levels;
      expect(copy).toHaveLength(4);
      expect(copy).not.toBe(profile.levels); // different reference
    });
  });
});
