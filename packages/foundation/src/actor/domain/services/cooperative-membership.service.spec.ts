import { FixedClock, SequentialIdGenerator, isErr, isOk } from '@nafa/shared';
import type { CooperativeMembershipRepository } from '../ports/cooperative-membership-repository.port';
import { Actor, type ActorDependencies } from '../actor.aggregate';
import { ActorRule } from '../actor.errors';
import {
  companyIdentity,
  cooperativeIdentity,
  personIdentity,
  type LegalIdentity,
} from '../identity';
import type { CooperativeMembership } from '../membership';
import { cooperativeMembershipId } from '../membership';
import { RoleType } from '../roles';
import {
  actorId,
  address,
  cooperativeRegistrationNumber,
  isoDate,
  LegalForm,
  nif,
  personName,
  phoneContact,
  phoneNumber,
  rccm,
  type ActorId,
  type IsoDate,
} from '../value-objects';
import { VerificationLevel } from '../verification-level.vo';
import { CooperativeMembershipService } from './cooperative-membership.service';

function unwrap<T>(result: { ok: boolean; value?: T; error?: Error }): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error?.message}`);
  return result.value as T;
}

const MEMBERSHIP_ID = unwrap(
  cooperativeMembershipId('11111111-1111-4111-8111-111111111111'),
);
const COOP_ID: ActorId = unwrap(
  actorId('22222222-2222-4222-8222-222222222222'),
);
const MEMBER_ID: ActorId = unwrap(
  actorId('33333333-3333-4333-8333-333333333333'),
);
const TODAY: IsoDate = unwrap(
  isoDate('2026-08-03', ActorRule.INVALID_BIRTH_DATE, 'Admitted at'),
);
const ADDRESS = unwrap(
  address({
    line: '',
    locality: 'Kindia',
    region: 'Kindia',
    countryCode: 'GN',
  }),
);
const CONTACT = phoneContact(unwrap(phoneNumber('+224620000000')));

const COOP_IDENTITY: LegalIdentity = unwrap(
  cooperativeIdentity({
    name: 'Coopérative de Kindia',
    legalForm: LegalForm.SCOOPS,
    registrationNumber: unwrap(
      cooperativeRegistrationNumber('GN-KND-2024-SCOOPS-00123'),
    ),
    nif: unwrap(nif('987654321')),
    incorporationDate: unwrap(
      isoDate('2021-02-10', ActorRule.INVALID_INCORPORATION_DATE, 'Inc.'),
    ),
  }),
);

const PERSON_IDENTITY: LegalIdentity = unwrap(
  personIdentity({
    name: unwrap(personName('Fatoumata', 'Barry')),
    birthDate: unwrap(
      isoDate('1990-05-02', ActorRule.INVALID_BIRTH_DATE, 'Birth date'),
    ),
    nationality: 'GN',
  }),
);

const COMPANY_IDENTITY: LegalIdentity = unwrap(
  companyIdentity({
    legalName: 'Kaloum Négoce',
    legalForm: LegalForm.SARL,
    rccm: unwrap(rccm('GN-CKY-2024-B-01234')),
    nif: unwrap(nif('123456789')),
    incorporationDate: unwrap(
      isoDate('2019-06-01', ActorRule.INVALID_INCORPORATION_DATE, 'Inc.'),
    ),
  }),
);

function deps(): ActorDependencies {
  return {
    clock: new FixedClock(new Date('2026-08-03T10:00:00.000Z')),
    ids: new SequentialIdGenerator(),
  };
}

function actor(id: ActorId, identity: LegalIdentity, activate = true): Actor {
  const built = unwrap(
    Actor.register(
      { id, identity, contacts: [CONTACT], address: ADDRESS },
      deps(),
    ),
  );
  if (!activate) return built;

  built.submitForVerification();
  built.upgradeVerification(VerificationLevel.BASIC);
  built.grantRole({ type: RoleType.BUYER, grantedAt: TODAY });
  built.activate();
  built.pullEvents();
  return built;
}

/**
 * An in-memory double, not a mock framework.
 *
 * The port is four methods over plain data; a hand-written double reads as
 * the storage it stands for, and a test that fails points at a rule rather
 * than at a mock expectation.
 */
class InMemoryMemberships implements CooperativeMembershipRepository {
  readonly saved: CooperativeMembership[] = [];

  async findById(): Promise<CooperativeMembership | null> {
    return null;
  }

  async findActiveBetween(
    cooperativeId: ActorId,
    memberId: ActorId,
  ): Promise<CooperativeMembership | null> {
    return (
      this.saved.find(
        (membership) =>
          membership.cooperativeId === cooperativeId &&
          membership.memberId === memberId &&
          membership.isActive,
      ) ?? null
    );
  }

  async listByCooperative(): Promise<readonly CooperativeMembership[]> {
    return this.saved;
  }

  async listByMember(): Promise<readonly CooperativeMembership[]> {
    return this.saved;
  }

  /** Records the version the caller claimed, so a test can assert it. */
  readonly savedWith: number[] = [];

  async save(
    membership: CooperativeMembership,
    expectedVersion: number,
  ): Promise<void> {
    this.saved.push(membership);
    this.savedWith.push(expectedVersion);
  }
}

describe('CooperativeMembershipService.admit', () => {
  let memberships: InMemoryMemberships;
  let service: CooperativeMembershipService;

  beforeEach(() => {
    memberships = new InMemoryMemberships();
    service = new CooperativeMembershipService(memberships, deps());
  });

  it('admits a person into an active cooperative', async () => {
    const result = await service.admit({
      id: MEMBERSHIP_ID,
      cooperative: actor(COOP_ID, COOP_IDENTITY),
      member: actor(MEMBER_ID, PERSON_IDENTITY),
      admittedAt: TODAY,
    });

    expect(isOk(result)).toBe(true);
    expect(unwrap(result).isActive).toBe(true);
  });

  it('admits a company', async () => {
    const result = await service.admit({
      id: MEMBERSHIP_ID,
      cooperative: actor(COOP_ID, COOP_IDENTITY),
      member: actor(MEMBER_ID, COMPANY_IDENTITY),
      admittedAt: TODAY,
    });

    expect(isOk(result)).toBe(true);
  });

  it('refuses the same member twice', async () => {
    // Uniqueness spans the collection: no aggregate can see its siblings, so
    // the check has to be asked of the store. That is what makes this a
    // domain service.
    const cooperative = actor(COOP_ID, COOP_IDENTITY);
    const member = actor(MEMBER_ID, PERSON_IDENTITY);

    const first = await service.admit({
      id: MEMBERSHIP_ID,
      cooperative,
      member,
      admittedAt: TODAY,
    });
    const created = unwrap(first);
    await memberships.save(created, created.expectedVersion);

    const second = await service.admit({
      id: MEMBERSHIP_ID,
      cooperative,
      member,
      admittedAt: TODAY,
    });

    expect(isErr(second)).toBe(true);
    if (isErr(second)) {
      expect(second.error.rule).toBe(ActorRule.MEMBER_ALREADY_ADMITTED);
    }
  });

  it('allows re-admission after the first membership ended', async () => {
    // Two distinct periods, not one revived: the gap may need accounting for.
    const cooperative = actor(COOP_ID, COOP_IDENTITY);
    const member = actor(MEMBER_ID, PERSON_IDENTITY);

    const first = unwrap(
      await service.admit({
        id: MEMBERSHIP_ID,
        cooperative,
        member,
        admittedAt: TODAY,
      }),
    );
    first.resign(TODAY);
    await memberships.save(first, first.expectedVersion);

    const second = await service.admit({
      id: MEMBERSHIP_ID,
      cooperative,
      member,
      admittedAt: TODAY,
    });

    expect(isOk(second)).toBe(true);
  });

  it.each([
    ['DRAFT', false],
    ['ACTIVE', true],
  ])('requires the cooperative to be ACTIVE (%s)', async (_label, active) => {
    const result = await service.admit({
      id: MEMBERSHIP_ID,
      cooperative: actor(COOP_ID, COOP_IDENTITY, active),
      member: actor(MEMBER_ID, PERSON_IDENTITY),
      admittedAt: TODAY,
    });

    if (active) {
      expect(isOk(result)).toBe(true);
    } else {
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.rule).toBe(ActorRule.COOPERATIVE_NOT_ACTIVE);
      }
    }
  });

  it('refuses admission by something that is not a cooperative', async () => {
    const result = await service.admit({
      id: MEMBERSHIP_ID,
      cooperative: actor(COOP_ID, COMPANY_IDENTITY),
      member: actor(MEMBER_ID, PERSON_IDENTITY),
      admittedAt: TODAY,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.NOT_A_COOPERATIVE);
    }
  });

  it('refuses a cooperative admitting itself', async () => {
    const cooperative = actor(COOP_ID, COOP_IDENTITY);

    const result = await service.admit({
      id: MEMBERSHIP_ID,
      cooperative,
      member: cooperative,
      admittedAt: TODAY,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.MEMBER_CANNOT_BE_COOPERATIVE);
    }
  });

  it('never touches the actors it is given', async () => {
    // The membership references two ActorIds and changes neither aggregate.
    const cooperative = actor(COOP_ID, COOP_IDENTITY);
    const member = actor(MEMBER_ID, PERSON_IDENTITY);
    const before = [cooperative.version, member.version];

    await service.admit({
      id: MEMBERSHIP_ID,
      cooperative,
      member,
      admittedAt: TODAY,
    });

    expect([cooperative.version, member.version]).toEqual(before);
    expect(cooperative.pullEvents()).toHaveLength(0);
    expect(member.pullEvents()).toHaveLength(0);
  });
});

describe('CooperativeMembershipService.isMember', () => {
  it('answers the business question rather than exposing a null check', async () => {
    const memberships = new InMemoryMemberships();
    const service = new CooperativeMembershipService(memberships, deps());
    const cooperative = actor(COOP_ID, COOP_IDENTITY);
    const member = actor(MEMBER_ID, PERSON_IDENTITY);

    expect(unwrap(await service.isMember(cooperative, member))).toBe(false);

    const membership = unwrap(
      await service.admit({
        id: MEMBERSHIP_ID,
        cooperative,
        member,
        admittedAt: TODAY,
      }),
    );
    await memberships.save(membership, membership.expectedVersion);

    expect(unwrap(await service.isMember(cooperative, member))).toBe(true);

    membership.resign(TODAY);
    expect(unwrap(await service.isMember(cooperative, member))).toBe(false);
  });
});
