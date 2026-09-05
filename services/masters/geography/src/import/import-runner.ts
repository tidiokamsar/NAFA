import {
  AdministrativeLevel,
  createAdministrativeArea,
  createCountryProfile,
  type CountryProfile,
} from '@nafa/geography';
import { SystemClock, UuidGenerator } from '@nafa/shared';
import type { PrismaCountryProfileRepository } from '../infrastructure/persistence/prisma/prisma-country-profile.repository';
import type { PrismaAdministrativeAreaRepository } from '../infrastructure/persistence/prisma/prisma-administrative-area.repository';
import type { PrismaAreaCodeUniquenessChecker } from '../infrastructure/persistence/prisma/prisma-area-code-uniqueness.checker';
import type { ImportFile } from './import-types';

/** One line of import output — what happened for one area or the profile. */
export interface ImportOutcome {
  readonly kind: 'profile' | 'area';
  readonly key: string;
  readonly action: 'created' | 'skipped-existing' | 'failed';
  readonly message?: string;
}

const LEVEL_ORDER: readonly string[] = [
  AdministrativeLevel.LEVEL_1,
  AdministrativeLevel.LEVEL_2,
  AdministrativeLevel.LEVEL_3,
  AdministrativeLevel.LEVEL_4,
];

/**
 * Imports one country's administrative structure from a validated file.
 *
 * Order of operations, chosen so every invariant is checkable when it is
 * checked:
 *  1. Country profile — create (DRAFT → PUBLISHED) or reuse the stored one.
 *  2. The COUNTRY root area — the country itself, code = countryCode. Invariant
 *     9 requires every LEVEL_1 to hang off a COUNTRY-rank parent; this root is
 *     what makes the hierarchy possible at all.
 *  3. Areas sorted by level ascending, so a parent is always registered (or
 *     found) before its children ask for it. Parents link by code: the runner
 *     keeps a code → areaId map seeded from the database for idempotence.
 *
 * Idempotence: re-running an already-imported file skips existing profiles
 * and areas instead of failing — the natural keys (countryCode for the
 * profile and root, countryCode+level+code for areas) decide.
 *
 * The domain does the validation: every entity goes through its factory,
 * which enforces the numbered invariants (levels declared, parent exactly one
 * level above, profile PUBLISHED…). The runner is orchestration only.
 */
export async function runImport(
  file: ImportFile,
  repos: {
    profiles: PrismaCountryProfileRepository;
    areas: PrismaAdministrativeAreaRepository;
    uniqueness: PrismaAreaCodeUniquenessChecker;
  },
): Promise<readonly ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  const clock = new SystemClock();
  const ids = new UuidGenerator();

  // ── 1. Country profile ─────────────────────────────────────────────────
  const existingProfile = await repos.profiles.findByCountry(file.country.code);

  let profile: CountryProfile;
  if (existingProfile?.status === 'PUBLISHED') {
    profile = existingProfile;
    outcomes.push({
      kind: 'profile',
      key: file.country.code,
      action: 'skipped-existing',
      message: 'Profile already PUBLISHED — reusing it.',
    });
  } else {
    const created = createCountryProfile({
      countryCode: file.country.code,
      levels: file.country.levels.map((l) => ({
        level: l.level as AdministrativeLevel,
        singular: l.singular,
        plural: l.plural,
      })),
      clock,
      ids,
    });
    if (!created.ok) {
      return [
        {
          kind: 'profile',
          key: file.country.code,
          action: 'failed',
          message: created.error.message,
        },
      ];
    }

    const published = created.value.publish();
    if (!published.ok) {
      return [
        {
          kind: 'profile',
          key: file.country.code,
          action: 'failed',
          message: published.error.message,
        },
      ];
    }

    await repos.profiles.save(created.value, 0);
    profile = created.value;
    outcomes.push({
      kind: 'profile',
      key: file.country.code,
      action: 'created',
      message: 'Profile created and PUBLISHED.',
    });
  }

  // ── 2. The COUNTRY root area — the country itself ─────────────────────
  // Invariant 9 requires LEVEL_1 areas to have a COUNTRY-rank parent; the
  // root is keyed by countryCode and created (or reused) before anything
  // else. Children reference it as parentCode = the country code.
  const codeToId = new Map<string, string>();
  {
    const existingRoot = await repos.areas.findByCode(
      file.country.code,
      file.country.code,
    );
    if (existingRoot) {
      codeToId.set(file.country.code, existingRoot.areaId as unknown as string);
      outcomes.push({
        kind: 'area',
        key: file.country.code,
        action: 'skipped-existing',
        message: 'COUNTRY root area already imported.',
      });
    } else {
      const root = createAdministrativeArea({
        area: {
          areaId: ids.generate() as unknown as string,
          level: AdministrativeLevel.COUNTRY,
          code: file.country.code,
          officialName: file.country.name,
          aliases: [],
          parentId: null,
          latitude: null,
          longitude: null,
          startDate: clock.now().toISOString().slice(0, 10),
          endDate: null,
        },
        profile,
        parentInfo: null,
        clock,
        ids,
      });
      if (!root.ok) {
        return [
          ...outcomes,
          {
            kind: 'area',
            key: file.country.code,
            action: 'failed',
            message: `COUNTRY root area could not be created: ${root.error.message}`,
          },
        ];
      }
      await repos.areas.save(root.value, 0);
      codeToId.set(file.country.code, root.value.areaId as unknown as string);
      outcomes.push({
        kind: 'area',
        key: file.country.code,
        action: 'created',
        message: `COUNTRY root area (${file.country.name}).`,
      });
    }
  }

  // ── 3. Areas, level ascending so parents exist first ──────────────────
  for (const area of file.areas) {
    const existing = await repos.areas.findByCode(file.country.code, area.code);
    if (existing) {
      codeToId.set(area.code, existing.areaId as unknown as string);
    }
  }

  const sorted = [...file.areas].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level),
  );

  for (const area of sorted) {
    if (codeToId.has(area.code)) {
      outcomes.push({
        kind: 'area',
        key: area.code,
        action: 'skipped-existing',
        message: `${area.officialName} already imported.`,
      });
      continue;
    }

    // Resolve the parent link before creating the area.
    let parentInfo: {
      parentId: never;
      parentLevel: AdministrativeLevel;
    } | null = null;

    if (area.parentCode !== null) {
      const parentAreaId = codeToId.get(area.parentCode);
      if (!parentAreaId) {
        outcomes.push({
          kind: 'area',
          key: area.code,
          action: 'failed',
          message: `Parent code "${area.parentCode}" not found — is the parent listed before its children, at the level above?`,
        });
        continue;
      }
      const parent = await repos.areas.findById(parentAreaId);
      if (!parent) {
        outcomes.push({
          kind: 'area',
          key: area.code,
          action: 'failed',
          message: `Parent "${area.parentCode}" resolved to a missing area.`,
        });
        continue;
      }
      parentInfo = {
        parentId: parent.areaId as never,
        parentLevel: parent.level,
      };
    }

    const created = createAdministrativeArea({
      area: {
        areaId: ids.generate() as unknown as string,
        level: area.level as AdministrativeLevel,
        code: area.code,
        officialName: area.officialName,
        aliases: area.aliases,
        parentId: parentInfo?.parentId ?? null,
        latitude: area.latitude ?? null,
        longitude: area.longitude ?? null,
        startDate: area.startDate ?? clock.now().toISOString().slice(0, 10),
        endDate: area.endDate ?? null,
      },
      profile,
      parentInfo,
      clock,
      ids,
    });

    if (!created.ok) {
      outcomes.push({
        kind: 'area',
        key: area.code,
        action: 'failed',
        message: created.error.message,
      });
      continue;
    }

    // Invariant 13: code free within country+level — ask the store.
    const unique = await repos.uniqueness.check(
      file.country.code as never,
      area.level as never,
      area.code as never,
    );
    if (!unique.ok) {
      outcomes.push({
        kind: 'area',
        key: area.code,
        action: 'failed',
        message: unique.error.message,
      });
      continue;
    }

    await repos.areas.save(created.value, 0);
    codeToId.set(area.code, created.value.areaId as unknown as string);
    outcomes.push({
      kind: 'area',
      key: area.code,
      action: 'created',
      message: area.officialName,
    });
  }

  return outcomes;
}
