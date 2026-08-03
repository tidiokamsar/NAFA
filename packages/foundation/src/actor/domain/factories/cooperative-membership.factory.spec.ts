import { FixedClock, IdGenerator, isErr, isOk, type Uuid } from '@nafa/shared';
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
import { RoleType } from '../roles';
import { CooperativeMembershipService } from '../services/cooperative-membership.service';
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
import { CooperativeMembershipFactory } from './cooperative-membership.factory';

function unwrap<T>(result: { ok: boolean; value?: T; error?: Error }): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error?.message}`);
  return result.value as T;
}

class DeterministicUuids extends IdGenerator {
  private next = 0;

  generate(): Uuid {
    const suffix = (this.next++).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}` as Uuid;
  }
}

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

const COOP_ID: ActorId = unwrap(
  actorId('22222222-2222-4222-8222-222222222222'),
);
const MEMBER_ID: ActorId = unwrap(
  actorId('33333333-3333-4333-8333-333333333333'),
);
const TODAY: IsoDate = unwrap(
  isoDate('2026-08-03', ActorRule.INVALID_BIRTH_DATE, 'Date'),
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

function deps(instant = '2026-08-03T10:00:00.000Z'): ActorDependencies {
  return {
    clock: new FixedClock(new Date(instant)),
    ids: new DeterministicUuids(),
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

function build(instant?: string) {
  const memberships = new InMemoryMemberships();
  const dependencies = deps(instant);
  return {
    memberships,
    factory: new CooperativeMembershipFactory(
      new CooperativeMembershipService(memberships, dependencies),
      dependencies,
    ),
  };
}

describe('valid creation', () => {
  it('creates an active membership for a person', async () => {
    const { factory } = build();

    const membership = unwrap(
      await factory.create({
        cooperative: actor(COOP_ID, COOP_IDENTITY),
        member: actor(MEMBER_ID, PERSON_IDENTITY),
      }),
    );

    expect(membership.isActive).toBe(true);
    expect(membership.cooperativeId).toBe(COOP_ID);
    expect(membership.memberId).toBe(MEMBER_ID);
    expect(membership.version).toBe(1);
  });

  it('creates one for a company', async () => {
    const { factory } = build();

    expect(
      isOk(
        await factory.create({
          cooperative: actor(COOP_ID, COOP_IDENTITY),
          member: actor(MEMBER_ID, COMPANY_IDENTITY),
        }),
      ),
    ).toBe(true);
  });

  it('accepts a back-dated admission, which paper records need', async () => {
    const { factory } = build();

    const membership = unwrap(
      await factory.create({
        cooperative: actor(COOP_ID, COOP_IDENTITY),
        member: actor(MEMBER_ID, PERSON_IDENTITY),
        admittedAt: '2024-03-01',
      }),
    );

    expect(membership.admittedAt).toBe('2024-03-01');
  });
});

describe('invalid creation is refused', () => {
  it.each([
    [
      'a company as the admitting body',
      COMPANY_IDENTITY,
      ActorRule.NOT_A_COOPERATIVE,
    ],
    [
      'a person as the admitting body',
      PERSON_IDENTITY,
      ActorRule.NOT_A_COOPERATIVE,
    ],
  ])('refuses %s', async (_label, identity, rule) => {
    const { factory } = build();

    const result = await factory.create({
      cooperative: actor(COOP_ID, identity),
      member: actor(MEMBER_ID, PERSON_IDENTITY),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(rule);
    }
  });

  it('refuses a cooperative that is not ACTIVE', async () => {
    const { factory } = build();

    const result = await factory.create({
      cooperative: actor(COOP_ID, COOP_IDENTITY, false),
      member: actor(MEMBER_ID, PERSON_IDENTITY),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.COOPERATIVE_NOT_ACTIVE);
    }
  });

  it('refuses a cooperative admitting itself', async () => {
    const { factory } = build();
    const cooperative = actor(COOP_ID, COOP_IDENTITY);

    const result = await factory.create({
      cooperative,
      member: cooperative,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.MEMBER_CANNOT_BE_COOPERATIVE);
    }
  });

  it('refuses a member already admitted', async () => {
    const { factory, memberships } = build();
    const cooperative = actor(COOP_ID, COOP_IDENTITY);
    const member = actor(MEMBER_ID, PERSON_IDENTITY);

    const first = unwrap(await factory.create({ cooperative, member }));
    await memberships.save(first, first.expectedVersion);

    const again = await factory.create({ cooperative, member });

    expect(isErr(again)).toBe(true);
    if (isErr(again)) {
      expect(again.error.rule).toBe(ActorRule.MEMBER_ALREADY_ADMITTED);
    }
  });

  it('refuses an unusable admission date', async () => {
    const { factory } = build();

    const result = await factory.create({
      cooperative: actor(COOP_ID, COOP_IDENTITY),
      member: actor(MEMBER_ID, PERSON_IDENTITY),
      admittedAt: '01/03/2024',
    });

    expect(isErr(result)).toBe(true);
  });
});

describe('determinism', () => {
  it('derives the admission date from the clock, not the wall', async () => {
    const { factory } = build('2025-11-20T23:30:00.000Z');

    const membership = unwrap(
      await factory.create({
        cooperative: actor(COOP_ID, COOP_IDENTITY),
        member: actor(MEMBER_ID, PERSON_IDENTITY),
      }),
    );

    expect(membership.admittedAt).toBe('2025-11-20');
  });

  it('stamps the event with the injected instant', async () => {
    const { factory } = build('2025-11-20T23:30:00.000Z');

    const membership = unwrap(
      await factory.create({
        cooperative: actor(COOP_ID, COOP_IDENTITY),
        member: actor(MEMBER_ID, PERSON_IDENTITY),
      }),
    );

    expect(membership.pullEvents()[0].occurredAt).toBe(
      '2025-11-20T23:30:00.000Z',
    );
  });

  it('takes its identifier from the generator', async () => {
    const { factory } = build();

    const membership = unwrap(
      await factory.create({
        cooperative: actor(COOP_ID, COOP_IDENTITY),
        member: actor(MEMBER_ID, PERSON_IDENTITY),
      }),
    );

    expect(membership.id).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('produces the same membership twice from the same inputs', async () => {
    const run = async () => {
      const { factory } = build();
      const membership = unwrap(
        await factory.create({
          cooperative: actor(COOP_ID, COOP_IDENTITY),
          member: actor(MEMBER_ID, PERSON_IDENTITY),
        }),
      );
      return {
        snapshot: membership.snapshot(),
        events: membership.pullEvents(),
      };
    };

    expect(await run()).toEqual(await run());
  });
});
