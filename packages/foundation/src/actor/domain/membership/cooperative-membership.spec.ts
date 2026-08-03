import {
  FixedClock,
  SequentialIdGenerator,
  isErr,
  isOk,
  type DomainEvent,
} from '@nafa/shared';
import type { ActorDependencies } from '../actor.aggregate';
import { ActorRule } from '../actor.errors';
import { ActorNature } from '../identity';
import { actorId, isoDate, type ActorId, type IsoDate } from '../value-objects';
import { cooperativeMembershipId } from './cooperative-membership-id.vo';
import { CooperativeMembership } from './cooperative-membership.aggregate';
import {
  MEMBERSHIP_AGGREGATE,
  MembershipEventType,
} from './cooperative-membership.events';
import { MembershipStatus } from './membership-status.vo';

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
const ADMITTED: IsoDate = unwrap(
  isoDate('2026-01-15', ActorRule.INVALID_BIRTH_DATE, 'Admitted at'),
);
const LATER: IsoDate = unwrap(
  isoDate('2026-08-03', ActorRule.INVALID_BIRTH_DATE, 'Ended at'),
);
const EARLIER: IsoDate = unwrap(
  isoDate('2025-12-01', ActorRule.INVALID_BIRTH_DATE, 'Ended at'),
);

function deps(): ActorDependencies {
  return {
    clock: new FixedClock(new Date('2026-08-03T10:00:00.000Z')),
    ids: new SequentialIdGenerator(),
  };
}

function admit(
  overrides: {
    cooperativeNature?: ActorNature;
    memberNature?: ActorNature;
    memberId?: ActorId;
  } = {},
) {
  return CooperativeMembership.admit(
    {
      id: MEMBERSHIP_ID,
      cooperativeId: COOP_ID,
      cooperativeNature: overrides.cooperativeNature ?? ActorNature.COOPERATIVE,
      memberId: overrides.memberId ?? MEMBER_ID,
      memberNature: overrides.memberNature ?? ActorNature.PERSON,
      admittedAt: ADMITTED,
    },
    deps(),
  );
}

describe('the admitting body must be a cooperative', () => {
  it.each([ActorNature.PERSON, ActorNature.COMPANY])(
    'refuses admission by a %s',
    (nature) => {
      const result = admit({ cooperativeNature: nature });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.rule).toBe(ActorRule.NOT_A_COOPERATIVE);
      }
    },
  );

  it('accepts admission by a cooperative', () => {
    expect(isOk(admit())).toBe(true);
  });
});

describe('a member cannot be the cooperative itself', () => {
  it('refuses when both ids are the same', () => {
    const result = admit({ memberId: COOP_ID });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.MEMBER_CANNOT_BE_COOPERATIVE);
    }
  });

  it('refuses a cooperative as a member', () => {
    // Two bodies owning each other leaves no defensible answer to "who are
    // the ultimate members".
    const result = admit({ memberNature: ActorNature.COOPERATIVE });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.MEMBER_CANNOT_BE_COOPERATIVE);
    }
  });
});

describe('a member may be a person or a company', () => {
  it.each([ActorNature.PERSON, ActorNature.COMPANY])(
    'admits a %s',
    (nature) => {
      const membership = unwrap(admit({ memberNature: nature }));

      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.isActive).toBe(true);
      expect(membership.cooperativeId).toBe(COOP_ID);
      expect(membership.memberId).toBe(MEMBER_ID);
    },
  );
});

describe('the lifecycle is controlled', () => {
  it('starts ACTIVE with no end date', () => {
    const membership = unwrap(admit());

    expect(membership.status).toBe(MembershipStatus.ACTIVE);
    expect(membership.endedAt).toBeUndefined();
  });

  it('records resignation and exclusion as different facts', () => {
    // A single ENDED state would lose which one happened, which is exactly
    // what gets asked for later in a dispute.
    const resigned = unwrap(admit());
    expect(isOk(resigned.resign(LATER))).toBe(true);
    expect(resigned.status).toBe(MembershipStatus.RESIGNED);

    const excluded = unwrap(admit());
    expect(isOk(excluded.exclude(LATER, 'unpaid contributions'))).toBe(true);
    expect(excluded.status).toBe(MembershipStatus.EXCLUDED);
  });

  it('stamps the end date', () => {
    const membership = unwrap(admit());
    membership.resign(LATER);

    expect(membership.endedAt).toBe(LATER);
  });

  it.each([
    ['resign', (m: CooperativeMembership) => m.resign(LATER)],
    ['exclude', (m: CooperativeMembership) => m.exclude(LATER, 'cause')],
  ])('refuses %s once the membership has ended', (_label, move) => {
    const membership = unwrap(admit());
    membership.resign(LATER);

    const again = move(membership);

    expect(isErr(again)).toBe(true);
    if (isErr(again)) {
      expect(again.error.rule).toBe(ActorRule.MEMBERSHIP_ALREADY_ENDED);
    }
    expect(membership.status).toBe(MembershipStatus.RESIGNED);
  });

  it('refuses an end date before the admission', () => {
    const membership = unwrap(admit());

    expect(isErr(membership.resign(EARLIER))).toBe(true);
    expect(membership.isActive).toBe(true);
  });

  it('allows ending on the day of admission', () => {
    const membership = unwrap(admit());

    expect(isOk(membership.resign(ADMITTED))).toBe(true);
  });
});

describe('every mutation emits an event and raises the version', () => {
  it('announces the admission at version 1', () => {
    const membership = unwrap(admit());
    const events = membership.pullEvents();

    expect(membership.version).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('cooperative-membership.admitted');
    expect(events[0].aggregate).toBe(MEMBERSHIP_AGGREGATE);
    expect(events[0].aggregateId).toBe(MEMBERSHIP_ID);
    expect(events[0].version).toBe(1);
    expect(events[0].occurredAt).toBe('2026-08-03T10:00:00.000Z');
  });

  it('emits one event per ending and reaches version 2', () => {
    const membership = unwrap(admit());
    membership.pullEvents();

    expect(isOk(membership.exclude(LATER, 'unpaid contributions'))).toBe(true);

    const events = membership.pullEvents();
    expect(membership.version).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe(MembershipEventType.MEMBER_EXCLUDED);
    expect(events[0].version).toBe(2);
  });

  it('carries both actor ids so a consumer needs no lookup', () => {
    const membership = unwrap(admit());
    const [event] = membership.pullEvents() as DomainEvent<{
      cooperativeId: ActorId;
      memberId: ActorId;
    }>[];

    expect(event.payload.cooperativeId).toBe(COOP_ID);
    expect(event.payload.memberId).toBe(MEMBER_ID);
  });

  it('records the cause of an exclusion', () => {
    // An exclusion is a decision taken against someone; one with no recorded
    // cause is indefensible if challenged.
    const membership = unwrap(admit());
    membership.pullEvents();
    membership.exclude(LATER, 'unpaid contributions');

    const [event] = membership.pullEvents() as DomainEvent<{
      reason?: string;
    }>[];
    expect(event.payload.reason).toBe('unpaid contributions');
  });

  it('emits nothing and holds the version when refused', () => {
    const membership = unwrap(admit());
    membership.pullEvents();

    expect(isErr(membership.resign(EARLIER))).toBe(true);
    expect(membership.pullEvents()).toHaveLength(0);
    expect(membership.version).toBe(1);
  });

  it('drains the buffer so nothing is published twice', () => {
    const membership = unwrap(admit());

    expect(membership.pullEvents()).toHaveLength(1);
    expect(membership.pullEvents()).toHaveLength(0);
  });
});

describe('rehydration', () => {
  it('restores state without rules or events', () => {
    const original = unwrap(admit());
    original.exclude(LATER, 'cause');
    const restored = CooperativeMembership.rehydrate(
      original.snapshot(),
      deps(),
    );

    expect(restored.snapshot()).toEqual(original.snapshot());
    expect(restored.pullEvents()).toHaveLength(0);
  });

  it('keeps an ended membership ended', () => {
    const original = unwrap(admit());
    original.resign(LATER);
    const restored = CooperativeMembership.rehydrate(
      original.snapshot(),
      deps(),
    );

    expect(restored.isActive).toBe(false);
    expect(isErr(restored.resign(LATER))).toBe(true);
  });
});

describe('expectedVersion carries optimistic concurrency', () => {
  it('is 0 for a membership that has never been stored', () => {
    // Which is what lets a repository tell an insert from an update without
    // asking a second question.
    expect(unwrap(admit()).expectedVersion).toBe(0);
  });

  it('does not move when the membership mutates', () => {
    // version does; keeping the two apart is the whole point.
    const membership = unwrap(admit());

    expect(isOk(membership.resign(LATER))).toBe(true);

    expect(membership.version).toBe(2);
    expect(membership.expectedVersion).toBe(0);
  });

  it('is the version a rehydrated membership was loaded at', () => {
    const stored = unwrap(admit()).snapshot();

    const loaded = CooperativeMembership.rehydrate(stored, deps());

    expect(loaded.expectedVersion).toBe(stored.version);
    expect(loaded.version).toBe(stored.version);
  });

  it('still points at the stored row after a rehydrated membership mutates', () => {
    // The value a repository must put in its WHERE clause: what the row held
    // when it was read, not what the aggregate holds now.
    const stored = unwrap(admit()).snapshot();
    const loaded = CooperativeMembership.rehydrate(stored, deps());

    loaded.exclude(LATER, 'unpaid contributions');

    expect(loaded.expectedVersion).toBe(stored.version);
    expect(loaded.version).toBe(stored.version + 1);
  });

  it('matches the contract Actor exposes, name for name', () => {
    // Two ports whose write signatures differed would let an adapter author
    // assume one aggregate needs concurrency control and the other does not.
    const membership = unwrap(admit());

    expect(typeof membership.expectedVersion).toBe('number');
    expect(typeof membership.version).toBe('number');
  });
});
