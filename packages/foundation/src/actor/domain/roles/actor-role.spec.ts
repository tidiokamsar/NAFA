import { isErr, isOk } from '@nafa/shared';
import { ActorRule } from '../actor.errors';
import { ActorNature } from '../identity';
import { isoDate, type IsoDate } from '../value-objects';
import { VerificationLevel } from '../verification-level.vo';
import { findRole, grantRole, hasRoleType } from './actor-role.entity';
import {
  InstitutionKind,
  ProductionKind,
  financialQualification,
  producerQualification,
} from './role-qualification.vo';
import { RoleType } from './role-type.vo';

function unwrap<T>(result: { ok: boolean; value?: T; error?: Error }): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error?.message}`);
  return result.value as T;
}

const TODAY: IsoDate = unwrap(
  isoDate('2026-08-03', ActorRule.INVALID_BIRTH_DATE, 'Granted at'),
);
const CROP = unwrap(producerQualification([ProductionKind.CROP]));

describe('grantRole', () => {
  it('builds a role that passes the policy', () => {
    const result = grantRole({
      type: RoleType.MERCHANT,
      nature: ActorNature.PERSON,
      verification: VerificationLevel.BASIC,
      grantedAt: TODAY,
    });

    expect(isOk(result)).toBe(true);
    const role = unwrap(result);
    expect(role.type).toBe(RoleType.MERCHANT);
    expect(role.grantedAt).toBe(TODAY);
    expect(role.qualification).toBeUndefined();
  });

  it('carries the qualification when the role takes one', () => {
    const role = unwrap(
      grantRole({
        type: RoleType.PRODUCER,
        nature: ActorNature.COOPERATIVE,
        verification: VerificationLevel.BASIC,
        grantedAt: TODAY,
        qualification: CROP,
      }),
    );

    expect(role.qualification).toEqual(CROP);
  });

  it('cannot construct an ineligible role at all', () => {
    // There is no other constructor, so an ineligible role is not merely
    // detected downstream — it never exists.
    const result = grantRole({
      type: RoleType.FINANCIAL,
      nature: ActorNature.COOPERATIVE,
      verification: VerificationLevel.ENHANCED,
      grantedAt: TODAY,
      qualification: financialQualification(InstitutionKind.BANK),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.ROLE_NATURE_INCOMPATIBLE);
    }
  });

  it('refuses a role the verification level does not reach', () => {
    const result = grantRole({
      type: RoleType.IMPORTER,
      nature: ActorNature.COMPANY,
      verification: VerificationLevel.BASIC,
      grantedAt: TODAY,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.ROLE_VERIFICATION_INSUFFICIENT);
    }
  });
});

describe('a role collection behaves as a set keyed by type', () => {
  const merchant = unwrap(
    grantRole({
      type: RoleType.MERCHANT,
      nature: ActorNature.COOPERATIVE,
      verification: VerificationLevel.BASIC,
      grantedAt: TODAY,
    }),
  );
  const producer = unwrap(
    grantRole({
      type: RoleType.PRODUCER,
      nature: ActorNature.COOPERATIVE,
      verification: VerificationLevel.BASIC,
      grantedAt: TODAY,
      qualification: CROP,
    }),
  );
  const roles = [merchant, producer];

  it('finds a held role by type', () => {
    expect(hasRoleType(roles, RoleType.PRODUCER)).toBe(true);
    expect(findRole(roles, RoleType.PRODUCER)).toBe(producer);
  });

  it('reports a role that is not held', () => {
    expect(hasRoleType(roles, RoleType.IMPORTER)).toBe(false);
    expect(findRole(roles, RoleType.IMPORTER)).toBeUndefined();
  });

  it('lets one actor hold several roles at once', () => {
    // The case that rules out an inheritance hierarchy: a cooperative farms,
    // buys from its members and resells in bulk.
    const buyer = unwrap(
      grantRole({
        type: RoleType.BUYER,
        nature: ActorNature.COOPERATIVE,
        verification: VerificationLevel.BASIC,
        grantedAt: TODAY,
      }),
    );
    const wholesaler = unwrap(
      grantRole({
        type: RoleType.WHOLESALER,
        nature: ActorNature.COOPERATIVE,
        verification: VerificationLevel.BASIC,
        grantedAt: TODAY,
      }),
    );

    const all = [...roles, buyer, wholesaler];
    expect(all.map((role) => role.type)).toEqual([
      RoleType.MERCHANT,
      RoleType.PRODUCER,
      RoleType.BUYER,
      RoleType.WHOLESALER,
    ]);
  });
});
