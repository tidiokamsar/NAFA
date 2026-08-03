import {
  FixedClock,
  SequentialIdGenerator,
  isErr,
  isOk,
  type DomainEvent,
} from '@nafa/shared';
import { Actor, type ActorDependencies } from './actor.aggregate';
import { ActorStatus } from './actor-status.vo';
import { ActorRule } from './actor.errors';
import { ACTOR_AGGREGATE, ActorEventType } from './actor.events';
import {
  ActorNature,
  companyIdentity,
  cooperativeIdentity,
  personIdentity,
  type LegalIdentity,
} from './identity';
import {
  InstitutionKind,
  ProductionKind,
  RoleType,
  financialQualification,
  producerQualification,
} from './roles';
import {
  actorId,
  address,
  cooperativeRegistrationNumber,
  emailAddress,
  emailContact,
  isoDate,
  LegalForm,
  nif,
  personName,
  phoneContact,
  phoneNumber,
  rccm,
  type ActorId,
  type ContactPoint,
  type IsoDate,
} from './value-objects';
import { VerificationLevel } from './verification-level.vo';

function unwrap<T>(result: { ok: boolean; value?: T; error?: Error }): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error?.message}`);
  return result.value as T;
}

const ID: ActorId = unwrap(actorId('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
const TODAY: IsoDate = unwrap(
  isoDate('2026-08-03', ActorRule.INVALID_BIRTH_DATE, 'Granted at'),
);
const ADDRESS = unwrap(
  address({
    line: 'Quartier Almamya',
    locality: 'Conakry',
    region: 'Conakry',
    countryCode: 'GN',
  }),
);
const PHONE = phoneContact(unwrap(phoneNumber('+224620000000')));
const EMAIL = emailContact(unwrap(emailAddress('contact@nafa.gn')));
const CROP = unwrap(producerQualification([ProductionKind.CROP]));

const PERSON: LegalIdentity = unwrap(
  personIdentity({
    name: unwrap(personName('Mamadou Alpha', 'Diallo')),
    birthDate: unwrap(
      isoDate('1985-03-17', ActorRule.INVALID_BIRTH_DATE, 'Birth date'),
    ),
    nationality: 'GN',
  }),
);

const COMPANY: LegalIdentity = unwrap(
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

const COOPERATIVE: LegalIdentity = unwrap(
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

function deps(): ActorDependencies {
  return {
    clock: new FixedClock(new Date('2026-08-03T10:00:00.000Z')),
    ids: new SequentialIdGenerator(),
  };
}

function register(
  identity: LegalIdentity = COMPANY,
  contacts: readonly ContactPoint[] = [PHONE],
): Actor {
  return unwrap(
    Actor.register({ id: ID, identity, contacts, address: ADDRESS }, deps()),
  );
}

/** Drives an actor to ACTIVE with one role, the shortest legal path. */
function activeActor(identity: LegalIdentity = COMPANY): Actor {
  const actor = register(identity);
  expect(isOk(actor.submitForVerification())).toBe(true);
  expect(isOk(actor.upgradeVerification(VerificationLevel.BASIC))).toBe(true);
  expect(
    isOk(actor.grantRole({ type: RoleType.MERCHANT, grantedAt: TODAY })),
  ).toBe(true);
  expect(isOk(actor.activate())).toBe(true);
  actor.pullEvents();
  return actor;
}

describe('invariant 1 — an actor has exactly one legal identity', () => {
  it('carries the identity it was registered with', () => {
    expect(register(PERSON).identity).toBe(PERSON);
    expect(register(COMPANY).identity).toBe(COMPANY);
  });
});

describe('invariant 2 — the legal identity never changes', () => {
  it('exposes no operation that replaces it', () => {
    const actor = register(COMPANY);
    const surface = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(actor)),
    ];

    // A setter or a "changeIdentity" would make invariant 2 unenforceable.
    expect(surface).not.toContain('changeIdentity');
    expect(surface).not.toContain('setIdentity');
    expect(
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(actor), 'identity')
        ?.set,
    ).toBeUndefined();
  });

  it('keeps the same identity through every mutation', () => {
    const actor = activeActor(COMPANY);
    actor.suspend('audit');
    actor.reactivate();
    actor.changeAddress(ADDRESS);

    expect(actor.identity).toBe(COMPANY);
  });
});

describe('invariant 3 — a role exists at most once', () => {
  it('refuses the same role twice', () => {
    const actor = activeActor();

    const again = actor.grantRole({
      type: RoleType.MERCHANT,
      grantedAt: TODAY,
    });

    expect(isErr(again)).toBe(true);
    if (isErr(again)) {
      expect(again.error.rule).toBe(ActorRule.ROLE_ALREADY_HELD);
    }
    expect(actor.roles).toHaveLength(1);
  });

  it('still allows different roles on the same actor', () => {
    // The case that rules out an inheritance hierarchy.
    const actor = register(COOPERATIVE);
    actor.submitForVerification();
    actor.upgradeVerification(VerificationLevel.BASIC);

    for (const type of [
      RoleType.PRODUCER,
      RoleType.BUYER,
      RoleType.WHOLESALER,
    ]) {
      const result = actor.grantRole({
        type,
        grantedAt: TODAY,
        ...(type === RoleType.PRODUCER ? { qualification: CROP } : {}),
      });
      expect(isOk(result)).toBe(true);
    }

    expect(actor.roles.map((role) => role.type)).toEqual([
      RoleType.PRODUCER,
      RoleType.BUYER,
      RoleType.WHOLESALER,
    ]);
  });

  it('does not let a caller add a role through the accessor', () => {
    const actor = activeActor();
    const stolen = actor.roles as unknown as unknown[];
    stolen.push({ type: RoleType.IMPORTER, grantedAt: TODAY });

    expect(actor.roles).toHaveLength(1);
  });
});

describe('invariant 4 — an ACTIVE actor holds at least one role', () => {
  it('refuses activation with no role', () => {
    const actor = register();
    actor.submitForVerification();
    actor.upgradeVerification(VerificationLevel.BASIC);

    const result = actor.activate();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(
        ActorRule.ACTOR_NOT_ACTIVATABLE_WITHOUT_ROLE,
      );
    }
    expect(actor.status).toBe(ActorStatus.PENDING_VERIFICATION);
  });

  it('refuses revoking the last role of an active actor', () => {
    // Refused rather than silently suspending: an implicit status change is
    // exactly the kind of thing nobody notices until production.
    const actor = activeActor();

    const result = actor.revokeRole(RoleType.MERCHANT);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(
        ActorRule.ACTOR_NOT_ACTIVATABLE_WITHOUT_ROLE,
      );
    }
    expect(actor.roles).toHaveLength(1);
  });

  it('allows revoking a role while another remains', () => {
    const actor = activeActor();
    actor.grantRole({ type: RoleType.BUYER, grantedAt: TODAY });

    expect(isOk(actor.revokeRole(RoleType.MERCHANT))).toBe(true);
    expect(actor.roles.map((role) => role.type)).toEqual([RoleType.BUYER]);
  });

  it('rejects revoking a role that is not held', () => {
    const actor = activeActor();

    const result = actor.revokeRole(RoleType.IMPORTER);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.ROLE_NOT_HELD);
    }
  });
});

describe('invariant 5 — SUSPENDED or CLOSED accepts no role', () => {
  it.each([
    ['SUSPENDED', (actor: Actor) => actor.suspend('audit')],
    ['CLOSED', (actor: Actor) => actor.close('ceased trading')],
  ])('refuses a grant while %s', (_label, move) => {
    const actor = activeActor();
    expect(isOk(move(actor))).toBe(true);

    const result = actor.grantRole({
      type: RoleType.BUYER,
      grantedAt: TODAY,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.ACTOR_STATUS_FORBIDS_ROLE_GRANT);
    }
  });

  it('keeps roles through suspension so reactivation restores them', () => {
    const actor = activeActor();
    actor.suspend('audit');

    expect(actor.roles).toHaveLength(1);
    expect(isOk(actor.reactivate())).toBe(true);
    expect(actor.status).toBe(ActorStatus.ACTIVE);
  });
});

describe('a CLOSED actor is immutable', () => {
  it.each([
    ['change its address', (actor: Actor) => actor.changeAddress(ADDRESS)],
    ['change its contacts', (actor: Actor) => actor.changeContacts([EMAIL])],
    [
      'upgrade its verification',
      (actor: Actor) => actor.upgradeVerification(VerificationLevel.ENHANCED),
    ],
    [
      'revoke its verification',
      (actor: Actor) =>
        actor.revokeVerification(VerificationLevel.NONE, 'fraud'),
    ],
    [
      'revoke one of its roles',
      (actor: Actor) => actor.revokeRole(RoleType.MERCHANT),
    ],
  ])(
    'refuses to %s without changing state or emitting an event',
    (_label, mutate) => {
      const actor = activeActor();
      actor.close('ceased trading');
      actor.pullEvents();
      const before = actor.snapshot();

      const result = mutate(actor);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.rule).toBe(ActorRule.ACTOR_IS_CLOSED);
      }
      expect(actor.snapshot()).toEqual(before);
      expect(actor.pullEvents()).toHaveLength(0);
    },
  );
});

describe('invariant 6 — status transitions are controlled', () => {
  it('walks the legal path DRAFT to CLOSED', () => {
    const actor = register();

    expect(actor.status).toBe(ActorStatus.DRAFT);
    expect(isOk(actor.submitForVerification())).toBe(true);
    expect(actor.status).toBe(ActorStatus.PENDING_VERIFICATION);

    actor.upgradeVerification(VerificationLevel.BASIC);
    actor.grantRole({ type: RoleType.MERCHANT, grantedAt: TODAY });

    expect(isOk(actor.activate())).toBe(true);
    expect(isOk(actor.suspend('audit'))).toBe(true);
    expect(isOk(actor.reactivate())).toBe(true);
    expect(isOk(actor.close('ceased trading'))).toBe(true);
    expect(actor.status).toBe(ActorStatus.CLOSED);
  });

  it('refuses activation straight from DRAFT', () => {
    const actor = register();
    actor.upgradeVerification(VerificationLevel.BASIC);
    actor.grantRole({ type: RoleType.MERCHANT, grantedAt: TODAY });

    const result = actor.activate();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.INVALID_STATUS_TRANSITION);
    }
  });

  it.each([
    ['reactivate', (actor: Actor) => actor.reactivate()],
    ['suspend', (actor: Actor) => actor.suspend('x')],
    ['close', (actor: Actor) => actor.close('x')],
    ['submit', (actor: Actor) => actor.submitForVerification()],
  ])('refuses %s once CLOSED — the status is terminal', (_label, move) => {
    // Reopening would show one continuous life where there were two.
    const actor = activeActor();
    actor.close('ceased trading');

    expect(isErr(move(actor))).toBe(true);
    expect(actor.status).toBe(ActorStatus.CLOSED);
  });
});

describe('invariant 7 — every mutation emits a domain event', () => {
  it('announces the registration', () => {
    const actor = register();
    const events = actor.pullEvents();

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe(ActorEventType.REGISTERED);
    expect(events[0].aggregate).toBe(ACTOR_AGGREGATE);
    expect(events[0].aggregateId).toBe(ID);
    expect(events[0].occurredAt).toBe('2026-08-03T10:00:00.000Z');
  });

  it('emits exactly one event per successful mutation', () => {
    const actor = register(COOPERATIVE);
    actor.pullEvents();

    const mutations: Array<[string, () => { ok: boolean }]> = [
      ['submit', () => actor.submitForVerification()],
      ['upgrade', () => actor.upgradeVerification(VerificationLevel.BASIC)],
      [
        'grant',
        () =>
          actor.grantRole({
            type: RoleType.PRODUCER,
            grantedAt: TODAY,
            qualification: CROP,
          }),
      ],
      ['activate', () => actor.activate()],
      ['contacts', () => actor.changeContacts([PHONE, EMAIL])],
      ['address', () => actor.changeAddress(ADDRESS)],
      ['suspend', () => actor.suspend('audit')],
      ['reactivate', () => actor.reactivate()],
      [
        'revokeVerification',
        () => actor.revokeVerification(VerificationLevel.NONE, 'fraud'),
      ],
      ['close', () => actor.close('ceased trading')],
    ];

    for (const [label, run] of mutations) {
      expect(run().ok).toBe(true);
      const events = actor.pullEvents();
      expect(`${label}:${events.length}`).toBe(`${label}:1`);
    }
  });

  it('emits nothing when a mutation is refused', () => {
    const actor = activeActor();

    expect(
      isErr(actor.grantRole({ type: RoleType.MERCHANT, grantedAt: TODAY })),
    ).toBe(true);
    expect(actor.pullEvents()).toHaveLength(0);
  });

  it('drains the buffer, so nothing is published twice', () => {
    const actor = register();

    expect(actor.pullEvents()).toHaveLength(1);
    expect(actor.pullEvents()).toHaveLength(0);
  });

  it('keeps personal data out of the contact event', () => {
    // The stream is copied into places a phone number should not reach.
    const actor = activeActor();
    actor.changeContacts([PHONE, EMAIL]);
    const [event] = actor.pullEvents() as DomainEvent<{
      channels: string[];
      count: number;
    }>[];

    expect(event.payload.channels).toEqual(['PHONE', 'EMAIL']);
    expect(event.payload.count).toBe(2);
    expect(JSON.stringify(event)).not.toContain('+224620000000');
    expect(JSON.stringify(event)).not.toContain('contact@nafa.gn');
  });
});

describe('invariant 8 — every mutation raises the version', () => {
  it('starts at 1 after registration', () => {
    expect(register().version).toBe(1);
  });

  it('increments once per successful mutation', () => {
    const actor = register();
    const before = actor.version;

    actor.submitForVerification();
    actor.upgradeVerification(VerificationLevel.BASIC);
    actor.grantRole({ type: RoleType.MERCHANT, grantedAt: TODAY });
    actor.activate();

    expect(actor.version).toBe(before + 4);
  });

  it('does not move when a mutation is refused', () => {
    const actor = activeActor();
    const before = actor.version;

    actor.grantRole({ type: RoleType.MERCHANT, grantedAt: TODAY });
    actor.revokeRole(RoleType.IMPORTER);
    actor.activate();

    expect(actor.version).toBe(before);
  });

  it('stamps each event with the version that produced it', () => {
    // A consumer orders the stream on this and spots a gap.
    const actor = register();
    actor.submitForVerification();
    actor.upgradeVerification(VerificationLevel.BASIC);

    expect(actor.pullEvents().map((event) => event.version)).toEqual([1, 2, 3]);
  });
});

describe('verification is a one-way scale unless explicitly revoked', () => {
  it('refuses a silent downgrade', () => {
    const actor = register();
    actor.upgradeVerification(VerificationLevel.ENHANCED);

    const result = actor.upgradeVerification(VerificationLevel.BASIC);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.VERIFICATION_CANNOT_BE_LOWERED);
    }
    expect(actor.verification).toBe(VerificationLevel.ENHANCED);
  });

  it('records a revocation with its stated cause', () => {
    // A downgrade that leaves no trace is how a fraud gets buried.
    const actor = register();
    actor.upgradeVerification(VerificationLevel.ENHANCED);
    actor.pullEvents();

    expect(
      isOk(
        actor.revokeVerification(VerificationLevel.BASIC, 'documents forged'),
      ),
    ).toBe(true);

    const [event] = actor.pullEvents() as DomainEvent<{ reason?: string }>[];
    expect(event.eventType).toBe(ActorEventType.VERIFICATION_REVOKED);
    expect(event.payload.reason).toBe('documents forged');
  });

  it('gates role eligibility on the level reached', () => {
    const actor = register(COMPANY);
    actor.submitForVerification();
    actor.upgradeVerification(VerificationLevel.BASIC);

    expect(
      isErr(actor.grantRole({ type: RoleType.IMPORTER, grantedAt: TODAY })),
    ).toBe(true);

    actor.upgradeVerification(VerificationLevel.ENHANCED);
    expect(
      isOk(actor.grantRole({ type: RoleType.IMPORTER, grantedAt: TODAY })),
    ).toBe(true);
  });
});

describe('contact points', () => {
  it('refuses registration with none', () => {
    const result = Actor.register(
      { id: ID, identity: COMPANY, contacts: [], address: ADDRESS },
      deps(),
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.NO_REACHABLE_CONTACT);
    }
  });

  it('keeps several, deduplicated', () => {
    const actor = activeActor();

    expect(isOk(actor.changeContacts([PHONE, EMAIL, PHONE]))).toBe(true);
    expect(actor.contacts).toHaveLength(2);
  });

  it('refuses emptying the list', () => {
    const actor = activeActor();

    expect(isErr(actor.changeContacts([]))).toBe(true);
    expect(actor.contacts).toHaveLength(1);
  });
});

describe('rehydration', () => {
  it('restores state without re-running rules or emitting events', () => {
    // The state was legal when written; re-validating on read would make a
    // rule change retroactively corrupt existing rows.
    const original = activeActor(COOPERATIVE);
    const restored = Actor.rehydrate(original.snapshot(), deps());

    expect(restored.snapshot()).toEqual(original.snapshot());
    expect(restored.pullEvents()).toHaveLength(0);
  });

  it('carries the nature through, so eligibility still applies', () => {
    const restored = Actor.rehydrate(
      activeActor(COOPERATIVE).snapshot(),
      deps(),
    );
    restored.upgradeVerification(VerificationLevel.ENHANCED);

    expect(restored.identity.nature).toBe(ActorNature.COOPERATIVE);
    expect(
      isErr(
        restored.grantRole({
          type: RoleType.FINANCIAL,
          grantedAt: TODAY,
          qualification: financialQualification(InstitutionKind.BANK),
        }),
      ),
    ).toBe(true);
  });
});

describe('a CLOSED actor is immutable, not merely unmovable', () => {
  /** Every business mutation, paired with the label the guard reports. */
  const MUTATIONS: ReadonlyArray<[string, (actor: Actor) => { ok: boolean }]> =
    [
      ['revokeRole', (actor) => actor.revokeRole(RoleType.MERCHANT)],
      [
        'upgradeVerification',
        (actor) => actor.upgradeVerification(VerificationLevel.ENHANCED),
      ],
      [
        'revokeVerification',
        (actor) => actor.revokeVerification(VerificationLevel.NONE, 'fraud'),
      ],
      ['changeContacts', (actor) => actor.changeContacts([PHONE, EMAIL])],
      ['changeAddress', (actor) => actor.changeAddress(ADDRESS)],
      [
        'grantRole',
        (actor) => actor.grantRole({ type: RoleType.BUYER, grantedAt: TODAY }),
      ],
    ];

  function closedActor(): Actor {
    const actor = activeActor();
    // A second role, so revokeRole would otherwise be allowed and the test
    // measures the terminal guard rather than the last-role rule.
    actor.grantRole({ type: RoleType.WHOLESALER, grantedAt: TODAY });
    actor.close('ceased trading');
    actor.pullEvents();
    return actor;
  }

  it.each(MUTATIONS)('refuses %s', (_label, mutate) => {
    const actor = closedActor();

    expect(mutate(actor).ok).toBe(false);
  });

  it('reports ACTOR_IS_CLOSED rather than a rule about the operation', () => {
    // The caller needs to know the record is closed, not that some other
    // precondition happened to fail first.
    const actor = closedActor();

    const result = actor.changeAddress(ADDRESS);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.ACTOR_IS_CLOSED);
    }
  });

  it('emits nothing and holds the version through every refusal', () => {
    // Without the guard each of these would have bumped the version and
    // pushed an event onto a record whose life is over.
    const actor = closedActor();
    const before = actor.version;

    for (const [, mutate] of MUTATIONS) {
      mutate(actor);
    }

    expect(actor.version).toBe(before);
    expect(actor.pullEvents()).toHaveLength(0);
  });

  it('leaves the state exactly as it was at closing', () => {
    const actor = closedActor();
    const before = actor.snapshot();

    for (const [, mutate] of MUTATIONS) {
      mutate(actor);
    }

    expect(actor.snapshot()).toEqual(before);
  });

  it('still allows reading', () => {
    // Closed is not deleted: the record stays queryable for history.
    const actor = closedActor();

    expect(actor.status).toBe(ActorStatus.CLOSED);
    expect(actor.roles).toHaveLength(2);
    expect(actor.identity).toBe(COMPANY);
  });
});

describe('expectedVersion carries optimistic concurrency', () => {
  it('keeps the pre-persistence version for an optimistic save', () => {
    const fresh = register();
    expect(fresh.expectedVersion).toBe(0);

    const restored = Actor.rehydrate(fresh.snapshot(), deps());
    const expected = restored.version;
    restored.submitForVerification();

    expect(restored.expectedVersion).toBe(expected);
    expect(restored.version).toBe(expected + 1);
  });

  it('is 0 for an actor that has never been stored', () => {
    // Which is what lets a repository tell an insert from an update without
    // asking a second question.
    expect(register().expectedVersion).toBe(0);
  });

  it('does not move when the actor mutates', () => {
    // version does; that is the whole point of keeping the two apart.
    const actor = register();
    const expected = actor.expectedVersion;

    actor.submitForVerification();
    actor.upgradeVerification(VerificationLevel.BASIC);

    expect(actor.version).toBeGreaterThan(expected);
    expect(actor.expectedVersion).toBe(expected);
  });

  it('is the version a rehydrated actor was loaded at', () => {
    const stored = activeActor().snapshot();

    const loaded = Actor.rehydrate(stored, deps());

    expect(loaded.expectedVersion).toBe(stored.version);
    expect(loaded.version).toBe(stored.version);
  });

  it('still points at the stored row after a rehydrated actor mutates', () => {
    // The value a repository must put in its WHERE clause: what the row held
    // when it was read, not what the aggregate holds now.
    const stored = activeActor().snapshot();
    const loaded = Actor.rehydrate(stored, deps());

    loaded.changeAddress(ADDRESS);

    expect(loaded.expectedVersion).toBe(stored.version);
    expect(loaded.version).toBe(stored.version + 1);
  });
});
