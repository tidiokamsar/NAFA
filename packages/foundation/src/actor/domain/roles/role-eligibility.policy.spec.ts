import { isErr, isOk } from '@nafa/shared';
import { ActorRule } from '../actor.errors';
import { ActorNature } from '../identity';
import { VerificationLevel } from '../verification-level.vo';
import {
  allowedNaturesFor,
  checkRoleEligibility,
  isRoleEligible,
  requiredVerificationFor,
} from './role-eligibility.policy';
import {
  financialQualification,
  InstitutionKind,
  ProductionKind,
  producerQualification,
  requiresQualification,
  TransportMode,
  transporterQualification,
  type RoleQualification,
} from './role-qualification.vo';
import { ALL_ROLE_TYPES, RoleType } from './role-type.vo';

function unwrap<T>(result: { ok: boolean; value?: T; error?: Error }): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error?.message}`);
  return result.value as T;
}

const PRODUCER_Q = unwrap(producerQualification([ProductionKind.CROP]));
const TRANSPORTER_Q = unwrap(transporterQualification([TransportMode.ROAD]));
const FINANCIAL_Q = financialQualification(InstitutionKind.BANK);

const QUALIFICATION_FOR: Partial<Record<RoleType, RoleQualification>> = {
  [RoleType.PRODUCER]: PRODUCER_Q,
  [RoleType.TRANSPORTER]: TRANSPORTER_Q,
  [RoleType.FINANCIAL]: FINANCIAL_Q,
};

/** The matrix, written out rather than derived — a table the reader can check. */
const MATRIX: ReadonlyArray<{
  type: RoleType;
  natures: readonly ActorNature[];
  verification: VerificationLevel;
}> = [
  {
    type: RoleType.PRODUCER,
    natures: [ActorNature.PERSON, ActorNature.COMPANY, ActorNature.COOPERATIVE],
    verification: VerificationLevel.BASIC,
  },
  {
    type: RoleType.MERCHANT,
    natures: [ActorNature.PERSON, ActorNature.COMPANY, ActorNature.COOPERATIVE],
    verification: VerificationLevel.BASIC,
  },
  {
    type: RoleType.WHOLESALER,
    natures: [ActorNature.PERSON, ActorNature.COMPANY, ActorNature.COOPERATIVE],
    verification: VerificationLevel.BASIC,
  },
  {
    type: RoleType.BUYER,
    natures: [ActorNature.PERSON, ActorNature.COMPANY, ActorNature.COOPERATIVE],
    verification: VerificationLevel.BASIC,
  },
  {
    type: RoleType.TRANSPORTER,
    natures: [ActorNature.PERSON, ActorNature.COMPANY, ActorNature.COOPERATIVE],
    verification: VerificationLevel.BASIC,
  },
  {
    type: RoleType.IMPORTER,
    natures: [ActorNature.COMPANY, ActorNature.COOPERATIVE],
    verification: VerificationLevel.ENHANCED,
  },
  {
    type: RoleType.FINANCIAL,
    natures: [ActorNature.COMPANY],
    verification: VerificationLevel.ENHANCED,
  },
];

describe('the eligibility matrix is complete', () => {
  it('covers every role type, so a new role cannot be forgotten', () => {
    expect(MATRIX.map((row) => row.type).sort()).toEqual(
      [...ALL_ROLE_TYPES].sort(),
    );
  });

  it.each(MATRIX)(
    '$type allows exactly the declared natures and verification',
    ({ type, natures, verification }) => {
      expect([...allowedNaturesFor(type)].sort()).toEqual([...natures].sort());
      expect(requiredVerificationFor(type)).toBe(verification);
    },
  );
});

describe('nature compatibility', () => {
  it.each(MATRIX)('$type accepts each allowed nature', ({ type, natures }) => {
    for (const nature of natures) {
      const result = checkRoleEligibility({
        type,
        nature,
        verification: VerificationLevel.ENHANCED,
        qualification: QUALIFICATION_FOR[type],
      });
      expect(isOk(result)).toBe(true);
    }
  });

  it.each(MATRIX)('$type refuses every other nature', ({ type, natures }) => {
    const refused = [
      ActorNature.PERSON,
      ActorNature.COMPANY,
      ActorNature.COOPERATIVE,
    ].filter((nature) => !natures.includes(nature));

    for (const nature of refused) {
      const result = checkRoleEligibility({
        type,
        nature,
        verification: VerificationLevel.ENHANCED,
        qualification: QUALIFICATION_FOR[type],
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.rule).toBe(ActorRule.ROLE_NATURE_INCOMPATIBLE);
      }
    }
  });

  it('keeps a natural person out of IMPORTER however well verified', () => {
    // A customs code is issued to a legal entity; no amount of due diligence
    // makes a natural person eligible.
    expect(
      isRoleEligible({
        type: RoleType.IMPORTER,
        nature: ActorNature.PERSON,
        verification: VerificationLevel.ENHANCED,
      }),
    ).toBe(false);
  });

  it('keeps a cooperative out of FINANCIAL', () => {
    // Member-owned and governed by the cooperative uniform act — not a
    // vehicle for a banking licence.
    expect(
      isRoleEligible({
        type: RoleType.FINANCIAL,
        nature: ActorNature.COOPERATIVE,
        verification: VerificationLevel.ENHANCED,
        qualification: FINANCIAL_Q,
      }),
    ).toBe(false);
  });
});

describe('verification thresholds', () => {
  it.each(MATRIX)(
    '$type refuses an actor below its required level',
    ({ type, natures, verification }) => {
      const below =
        verification === VerificationLevel.ENHANCED
          ? VerificationLevel.BASIC
          : VerificationLevel.NONE;

      const result = checkRoleEligibility({
        type,
        nature: natures[0],
        verification: below,
        qualification: QUALIFICATION_FOR[type],
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.rule).toBe(
          ActorRule.ROLE_VERIFICATION_INSUFFICIENT,
        );
      }
    },
  );

  it('refuses every role at NONE', () => {
    // NONE means nothing was checked; no capacity follows from it.
    for (const type of ALL_ROLE_TYPES) {
      expect(
        isRoleEligible({
          type,
          nature: ActorNature.COMPANY,
          verification: VerificationLevel.NONE,
          qualification: QUALIFICATION_FOR[type],
        }),
      ).toBe(false);
    }
  });

  it('lets ENHANCED satisfy a role that only needs BASIC', () => {
    // The scale is ordered, not a set of flags.
    expect(
      isRoleEligible({
        type: RoleType.MERCHANT,
        nature: ActorNature.PERSON,
        verification: VerificationLevel.ENHANCED,
      }),
    ).toBe(true);
  });
});

describe('qualifications', () => {
  it('requires one for exactly PRODUCER, TRANSPORTER and FINANCIAL', () => {
    const required = ALL_ROLE_TYPES.filter(requiresQualification);

    expect([...required].sort()).toEqual(
      [RoleType.FINANCIAL, RoleType.PRODUCER, RoleType.TRANSPORTER].sort(),
    );
  });

  it.each([RoleType.PRODUCER, RoleType.TRANSPORTER, RoleType.FINANCIAL])(
    'refuses %s without a qualification',
    (type) => {
      const result = checkRoleEligibility({
        type,
        nature: ActorNature.COMPANY,
        verification: VerificationLevel.ENHANCED,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.rule).toBe(ActorRule.ROLE_QUALIFICATION_REQUIRED);
      }
    },
  );

  it.each([
    RoleType.MERCHANT,
    RoleType.WHOLESALER,
    RoleType.BUYER,
    RoleType.IMPORTER,
  ])('refuses a qualification on %s instead of ignoring it', (type) => {
    // Silently dropping it would leave the caller believing something was
    // recorded that was not.
    const result = checkRoleEligibility({
      type,
      nature: ActorNature.COMPANY,
      verification: VerificationLevel.ENHANCED,
      qualification: PRODUCER_Q,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.ROLE_QUALIFICATION_UNEXPECTED);
    }
  });

  it('refuses a qualification that describes a different role', () => {
    const result = checkRoleEligibility({
      type: RoleType.PRODUCER,
      nature: ActorNature.COMPANY,
      verification: VerificationLevel.BASIC,
      qualification: TRANSPORTER_Q,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.ROLE_QUALIFICATION_MISMATCHED);
    }
  });
});

describe('qualification construction', () => {
  it('rejects an empty producer qualification', () => {
    const result = producerQualification([]);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.ROLE_QUALIFICATION_EMPTY);
    }
  });

  it('rejects an empty transporter qualification', () => {
    expect(isErr(transporterQualification([]))).toBe(true);
  });

  it('de-duplicates repeated kinds and modes', () => {
    expect(
      unwrap(
        producerQualification([
          ProductionKind.CROP,
          ProductionKind.CROP,
          ProductionKind.LIVESTOCK,
        ]),
      ).kinds,
    ).toEqual([ProductionKind.CROP, ProductionKind.LIVESTOCK]);

    expect(
      unwrap(transporterQualification([TransportMode.ROAD, TransportMode.ROAD]))
        .modes,
    ).toEqual([TransportMode.ROAD]);
  });

  it('keeps mobile money issuers distinct from banks', () => {
    // The most consequential distinction in this context: an EMI holds a
    // different central-bank licence from a bank.
    expect(financialQualification(InstitutionKind.EMI).institutionKind).toBe(
      InstitutionKind.EMI,
    );
    expect(financialQualification(InstitutionKind.BANK).institutionKind).toBe(
      InstitutionKind.BANK,
    );
    expect(
      financialQualification(InstitutionKind.MICROFINANCE).institutionKind,
    ).toBe(InstitutionKind.MICROFINANCE);
  });
});
