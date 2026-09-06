import {
  ActorRule,
  MembershipStatus,
  actorId,
  cooperativeMembershipId,
  isoDate,
  type CooperativeMembershipSnapshot,
} from '@nafa/foundation';
import {
  membershipToRow,
  membershipToSnapshot,
} from './cooperative-membership.mapper';

function unwrap<T>(result: { ok: boolean; value?: T; error?: Error }): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error?.message}`);
  return result.value as T;
}

const MEMBERSHIP_ID = unwrap(
  cooperativeMembershipId('4a1504e0-4f89-41d3-9a0c-0305e82c3311'),
);
const COOP = unwrap(actorId('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
const MEMBER = unwrap(actorId('3f2504e0-4f89-41d3-9a0c-0305e82c3302'));
const ADMITTED = unwrap(
  isoDate('2026-01-15', ActorRule.INVALID_BIRTH_DATE, 'Admitted'),
);
const ENDED = unwrap(
  isoDate('2026-06-30', ActorRule.INVALID_BIRTH_DATE, 'Ended'),
);

function snapshot(
  overrides: Partial<CooperativeMembershipSnapshot> = {},
): CooperativeMembershipSnapshot {
  return {
    id: MEMBERSHIP_ID,
    cooperativeId: COOP,
    memberId: MEMBER,
    status: MembershipStatus.ACTIVE,
    admittedAt: ADMITTED,
    version: 1,
    ...overrides,
  };
}

describe('the optional end date', () => {
  it('becomes null in the row when the membership is still running', () => {
    expect(membershipToRow(snapshot()).endedAt).toBeNull();
  });

  it('comes back undefined, not null, so the snapshot keeps its shape', () => {
    const row = membershipToRow(snapshot());

    expect(membershipToSnapshot({ ...row, endedAt: null })).not.toHaveProperty(
      'endedAt',
      null,
    );
    expect(
      membershipToSnapshot({ ...row, endedAt: null }).endedAt,
    ).toBeUndefined();
  });

  it('survives the round trip when it is set', () => {
    const original = snapshot({
      status: MembershipStatus.RESIGNED,
      endedAt: ENDED,
      version: 2,
    });

    expect(membershipToSnapshot(membershipToRow(original))).toEqual(original);
  });
});

describe('the round trip', () => {
  it('returns the snapshot it was given', () => {
    const original = snapshot();

    expect(membershipToSnapshot(membershipToRow(original))).toEqual(original);
  });
});
