import { FixedClock, IdGenerator, isErr, isOk, type Uuid } from '@nafa/shared';
import type { ActorRepository } from '../ports/actor-repository.port';
import { Actor, type ActorDependencies } from '../actor.aggregate';
import { ActorStatus } from '../actor-status.vo';
import { ActorRule } from '../actor.errors';
import { ActorNature } from '../identity';
import { ActorUniquenessChecker } from '../services/actor-uniqueness.checker';
import type { ActorId, Nif, PhoneNumber, Rccm } from '../value-objects';
import { VerificationLevel } from '../verification-level.vo';
import {
  ActorFactory,
  type CreateCompanyInput,
  type CreateCooperativeInput,
  type CreatePersonInput,
} from './actor.factory';

function unwrap<T>(result: { ok: boolean; value?: T; error?: Error }): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error?.message}`);
  return result.value as T;
}

/**
 * A hand-written double over the port.
 *
 * Not a mock framework: the port is five methods over plain data, and a
 * failure then points at a rule rather than at an unmet expectation.
 */
class InMemoryActors implements ActorRepository {
  readonly saved: Actor[] = [];
  readonly expectedVersions: number[] = [];

  async findById(): Promise<Actor | null> {
    return null;
  }

  async findByRccm(value: Rccm): Promise<Actor | null> {
    return (
      this.saved.find(
        (actor) =>
          actor.identity.nature === ActorNature.COMPANY &&
          actor.identity.rccm === value,
      ) ?? null
    );
  }

  async findByNif(value: Nif): Promise<Actor | null> {
    return this.saved.find((actor) => actor.identity.nif === value) ?? null;
  }

  async findByPhoneNumber(value: PhoneNumber): Promise<readonly Actor[]> {
    return this.saved.filter((actor) =>
      actor.contacts.some((contact) => contact.value === value),
    );
  }

  async save(actor: Actor, expectedVersion: number): Promise<void> {
    this.saved.push(actor);
    this.expectedVersions.push(expectedVersion);
  }
}

const ADDRESS = { locality: 'Conakry', region: 'Conakry', countryCode: 'GN' };
const CONTACTS = { phones: ['+224620000000'] };

const PERSON: CreatePersonInput = {
  givenNames: 'Mamadou Alpha',
  familyName: 'Diallo',
  birthDate: '1985-03-17',
  nationality: 'GN',
  contacts: CONTACTS,
  address: ADDRESS,
};

const COMPANY: CreateCompanyInput = {
  legalName: 'Kaloum Négoce',
  legalForm: 'SARL',
  rccm: 'GN-CKY-2024-B-01234',
  taxIdentifier: '123456789',
  incorporationDate: '2019-06-01',
  contacts: CONTACTS,
  address: ADDRESS,
};

const COOPERATIVE: CreateCooperativeInput = {
  name: 'Coopérative de Kindia',
  legalForm: 'SCOOPS',
  registrationNumber: 'GN-KND-2024-SCOOPS-00123',
  taxIdentifier: '987654321',
  incorporationDate: '2021-02-10',
  contacts: { phones: ['+224621111111'] },
  address: { locality: 'Kindia', region: 'Kindia', countryCode: 'GN' },
};

/**
 * Deterministic UUIDs, in order, without end.
 *
 * `SequentialIdGenerator` falls back to `id-N` once its list runs out, and
 * `id-2` is not a UUID — which matters here because one generator serves two
 * id spaces: the aggregate takes one for the ActorId and one more for every
 * event it emits. A registration therefore consumes two. Rather than counting
 * them in each test, this yields valid ids indefinitely and stays predictable.
 */
class DeterministicUuids extends IdGenerator {
  private next = 0;

  generate(): Uuid {
    const suffix = (this.next++).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}` as Uuid;
  }
}

/** The id an actor created first will carry. */
const FIRST_ID = '00000000-0000-4000-8000-000000000000' as ActorId;
/** The next actor: id 1 went to the first actor's registration event. */
const SECOND_ID = '00000000-0000-4000-8000-000000000002' as ActorId;

/** Ids and time are supplied, never read from the environment. */
function deps(ids: IdGenerator = new DeterministicUuids()): ActorDependencies {
  return {
    clock: new FixedClock(new Date('2026-08-03T10:00:00.000Z')),
    ids,
  };
}

function factoryWith(
  actors = new InMemoryActors(),
  ids: IdGenerator = new DeterministicUuids(),
) {
  return {
    actors,
    factory: new ActorFactory(new ActorUniquenessChecker(actors), deps(ids)),
  };
}

describe('valid creation', () => {
  it('creates a person in DRAFT at NONE verification', async () => {
    const { factory } = factoryWith();

    const actor = unwrap(await factory.createPerson(PERSON));

    expect(actor.identity.nature).toBe(ActorNature.PERSON);
    expect(actor.status).toBe(ActorStatus.DRAFT);
    expect(actor.verification).toBe(VerificationLevel.NONE);
    expect(actor.roles).toHaveLength(0);
    expect(actor.version).toBe(1);
  });

  it('creates a company and a cooperative', async () => {
    const { factory } = factoryWith();

    const company = unwrap(await factory.createCompany(COMPANY));
    const cooperative = unwrap(await factory.createCooperative(COOPERATIVE));

    expect(company.identity.nature).toBe(ActorNature.COMPANY);
    expect(cooperative.identity.nature).toBe(ActorNature.COOPERATIVE);
  });

  it('normalises raw input on the way in', async () => {
    // The factory is the single door, so canonicalisation happens once.
    const { factory } = factoryWith();

    const actor = unwrap(
      await factory.createCompany({
        ...COMPANY,
        rccm: 'gn/cky/2024/b/01234',
        taxIdentifier: '123.456.789',
        contacts: { phones: ['+224 620 00 00 00'], emails: ['  A@NAFA.GN '] },
      }),
    );

    expect(
      actor.identity.nature === ActorNature.COMPANY && actor.identity.rccm,
    ).toBe('GN-CKY-2024-B-01234');
    expect(actor.contacts.map((contact) => contact.value)).toEqual([
      '+224620000000',
      'a@nafa.gn',
    ]);
  });

  it('accepts an address with no street line', async () => {
    const { factory } = factoryWith();

    expect(isOk(await factory.createPerson(PERSON))).toBe(true);
  });

  it('emits the registration event', async () => {
    const { factory } = factoryWith();

    const actor = unwrap(await factory.createPerson(PERSON));
    const events = actor.pullEvents();

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('actor.registered');
  });
});

describe('invalid creation is refused, not repaired', () => {
  it.each([
    ['blank family name', { familyName: '  ' }, ActorRule.INVALID_PERSON_NAME],
    [
      'impossible birth date',
      { birthDate: '2025-02-30' },
      ActorRule.INVALID_BIRTH_DATE,
    ],
    [
      'birth date in the wrong format',
      { birthDate: '17/03/1985' },
      ActorRule.INVALID_BIRTH_DATE,
    ],
    [
      'bad nationality code',
      { nationality: 'GIN' },
      ActorRule.INVALID_PERSON_NAME,
    ],
    [
      'unusable phone number',
      { contacts: { phones: ['224620000000'] } },
      ActorRule.INVALID_PHONE_NUMBER,
    ],
    ['no contact at all', { contacts: {} }, ActorRule.NO_REACHABLE_CONTACT],
    [
      'missing locality',
      { address: { locality: '', region: 'Conakry', countryCode: 'GN' } },
      ActorRule.INVALID_ADDRESS,
    ],
  ])('refuses a person with %s', async (_label, override, rule) => {
    const { factory } = factoryWith();

    const result = await factory.createPerson({
      ...PERSON,
      ...(override as Partial<CreatePersonInput>),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(rule);
    }
  });

  it.each([
    ['unknown legal form', { legalForm: 'LLC' }, ActorRule.INVALID_LEGAL_FORM],
    [
      'a cooperative form on a company',
      { legalForm: 'SCOOPS' },
      ActorRule.LEGAL_FORM_NOT_ALLOWED_FOR_NATURE,
    ],
    ['malformed RCCM', { rccm: '123456' }, ActorRule.INVALID_RCCM],
    ['malformed NIF', { taxIdentifier: '12A' }, ActorRule.INVALID_NIF],
  ])('refuses a company with %s', async (_label, override, rule) => {
    const { factory } = factoryWith();

    const result = await factory.createCompany({
      ...COMPANY,
      ...(override as Partial<CreateCompanyInput>),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(rule);
    }
  });

  it('refuses a cooperative registered with a commercial number', async () => {
    const { factory } = factoryWith();

    const result = await factory.createCooperative({
      ...COOPERATIVE,
      registrationNumber: 'GN-CKY-2024-B-01234',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(
        ActorRule.INVALID_COOPERATIVE_REGISTRATION,
      );
    }
  });

  it('refuses a company form on a cooperative', async () => {
    const { factory } = factoryWith();

    const result = await factory.createCooperative({
      ...COOPERATIVE,
      legalForm: 'SARL',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(
        ActorRule.LEGAL_FORM_NOT_ALLOWED_FOR_NATURE,
      );
    }
  });

  it('consumes no identifier when it refuses', async () => {
    // A rejected registration must not burn an id: the factory generates one
    // only after every validation has passed. Otherwise the sequence gaps and
    // someone has to explain the missing numbers.
    const { factory } = factoryWith();

    const refused = await factory.createPerson({ ...PERSON, familyName: ' ' });
    expect(isErr(refused)).toBe(true);

    const actor = unwrap(await factory.createPerson(PERSON));

    expect(actor).toBeInstanceOf(Actor);
    expect(actor.id).toBe(FIRST_ID);
  });
});

describe('uniqueness across the registry', () => {
  it('refuses a second company on the same RCCM', async () => {
    const actors = new InMemoryActors();
    const { factory } = factoryWith(actors);

    const first = unwrap(await factory.createCompany(COMPANY));
    await actors.save(first, first.expectedVersion);

    const second = await factory.createCompany({
      ...COMPANY,
      taxIdentifier: '555555555',
    });

    expect(isErr(second)).toBe(true);
    if (isErr(second)) {
      expect(second.error.rule).toBe(ActorRule.RCCM_ALREADY_REGISTERED);
    }
  });

  it('refuses a second actor on the same NIF, across natures', async () => {
    const actors = new InMemoryActors();
    const { factory } = factoryWith(actors);

    const first = unwrap(await factory.createCompany(COMPANY));
    await actors.save(first, first.expectedVersion);

    const cooperative = await factory.createCooperative({
      ...COOPERATIVE,
      taxIdentifier: COMPANY.taxIdentifier,
    });

    expect(isErr(cooperative)).toBe(true);
    if (isErr(cooperative)) {
      expect(cooperative.error.rule).toBe(ActorRule.NIF_ALREADY_REGISTERED);
    }
  });

  it('does not block a shared phone number', async () => {
    // Sharing a handset is ordinary here: a producer registers on a
    // relative's phone. Refusing would make those people unregisterable.
    const actors = new InMemoryActors();
    const { factory } = factoryWith(actors);

    const first = unwrap(await factory.createPerson(PERSON));
    await actors.save(first, first.expectedVersion);

    const second = await factory.createPerson({
      ...PERSON,
      familyName: 'Barry',
    });

    expect(isOk(second)).toBe(true);
  });

  it('reports the shared number so the caller can act on it', async () => {
    const actors = new InMemoryActors();
    const { factory } = factoryWith(actors);
    const checker = new ActorUniquenessChecker(actors);

    const first = unwrap(await factory.createPerson(PERSON));
    await actors.save(first, first.expectedVersion);

    const collisions = await checker.findPhoneNumberCollisions(first.contacts);

    expect(collisions.get('+224620000000' as PhoneNumber)).toEqual([first.id]);
  });

  it('does not report an actor colliding with itself', async () => {
    const actors = new InMemoryActors();
    const { factory } = factoryWith(actors);
    const checker = new ActorUniquenessChecker(actors);

    const actor = unwrap(await factory.createPerson(PERSON));
    await actors.save(actor, actor.expectedVersion);

    const collisions = await checker.findPhoneNumberCollisions(
      actor.contacts,
      actor.id,
    );

    expect(collisions.size).toBe(0);
  });
});

describe('determinism', () => {
  it('takes its identifier from the generator, not from randomness', async () => {
    const { factory } = factoryWith();

    const first = unwrap(await factory.createPerson(PERSON));
    const second = unwrap(
      await factory.createPerson({ ...PERSON, familyName: 'Barry' }),
    );

    expect(first.id).toBe(FIRST_ID);
    // Not consecutive: the registration event of the first actor took the id
    // in between. One generator serves both id spaces.
    expect(second.id).toBe(SECOND_ID);
  });

  it('takes its event timestamp from the clock, not from the wall', async () => {
    const { factory } = factoryWith();

    const actor = unwrap(await factory.createPerson(PERSON));

    expect(actor.pullEvents()[0].occurredAt).toBe('2026-08-03T10:00:00.000Z');
  });

  it('produces the same actor twice from the same inputs', async () => {
    // Two runs, two fresh doubles, identical fixed clock and id sequence.
    const build = async () => {
      const { factory } = factoryWith();
      const actor = unwrap(await factory.createPerson(PERSON));
      return { snapshot: actor.snapshot(), events: actor.pullEvents() };
    };

    expect(await build()).toEqual(await build());
  });
});
