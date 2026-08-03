import {
  buildDomainEvent,
  type Clock,
  type DomainEvent,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@nafa/shared';
import {
  ActorStatus,
  acceptsRoleGrant,
  checkTransition,
  isTerminal,
} from './actor-status.vo';
import { ActorRule, ActorRuleViolation } from './actor.errors';
import {
  ACTOR_AGGREGATE,
  ActorEventType,
  type ActorEventType as ActorEventTypeValue,
} from './actor.events';
import type { LegalIdentity } from './identity';
import {
  findRole,
  grantRole,
  hasRoleType,
  type ActorRole,
  type RoleQualification,
  type RoleType,
} from './roles';
import type { ActorId, Address, ContactPoint, IsoDate } from './value-objects';
import { channelsOf, contactPoints, isReachable } from './value-objects';
import {
  VerificationLevel,
  isVerificationUpgrade,
} from './verification-level.vo';

/** Everything needed to bring an actor into existence. */
export interface RegisterActorInput {
  readonly id: ActorId;
  readonly identity: LegalIdentity;
  readonly contacts: readonly ContactPoint[];
  readonly address: Address;
}

/** The persisted shape a repository hands back. */
export interface ActorSnapshot {
  readonly id: ActorId;
  readonly identity: LegalIdentity;
  readonly status: ActorStatus;
  readonly verification: VerificationLevel;
  readonly contacts: readonly ContactPoint[];
  readonly address: Address;
  readonly roles: readonly ActorRole[];
  readonly version: number;
}

export interface ActorDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * The economic actor: who they are, what they may do, and where they stand.
 *
 * A class rather than a plain record, unlike the value objects around it. An
 * aggregate has to own three things a record cannot: the invariants that make
 * a state legal, the version that makes concurrent writes detectable, and the
 * buffer of events a mutation produced. Encapsulating them is what stops a
 * caller assembling an Actor that could never have been reached by any legal
 * sequence of operations.
 *
 * Every mutation returns `Result` rather than throwing. A refused business
 * rule is an expected answer, not an exception.
 *
 * `clock` and `ids` are injected so events are deterministic in tests without
 * freezing global time.
 */
export class Actor {
  private readonly pending: DomainEvent[] = [];

  /**
   * The version this actor was loaded at, frozen for its lifetime.
   *
   * `version` moves with every mutation, so it is the wrong value to compare
   * against the stored row: by the time a caller saves, it has already moved.
   * This is what a repository needs for its `WHERE version = ?`.
   */
  private readonly loadedVersion: number;

  private constructor(
    readonly id: ActorId,
    private readonly legalIdentity: LegalIdentity,
    private currentStatus: ActorStatus,
    private currentVerification: VerificationLevel,
    private currentContacts: readonly ContactPoint[],
    private currentAddress: Address,
    private currentRoles: ActorRole[],
    private currentVersion: number,
    private readonly deps: ActorDependencies,
  ) {
    this.loadedVersion = currentVersion;
  }

  // ---------------------------------------------------------------- creation

  /**
   * Registers a new actor in DRAFT.
   *
   * Not `new Actor(...)`: the constructor is private so there is exactly one
   * way in, and it is one that checks the contact invariant and emits the
   * registration event.
   */
  static register(
    input: RegisterActorInput,
    deps: ActorDependencies,
  ): Result<Actor, ActorRuleViolation> {
    if (!isReachable(input.contacts)) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.NO_REACHABLE_CONTACT,
          'An actor needs at least one contact point.',
        ),
      );
    }

    const actor = new Actor(
      input.id,
      input.identity,
      ActorStatus.DRAFT,
      VerificationLevel.NONE,
      input.contacts,
      input.address,
      [],
      0,
      deps,
    );

    actor.record(ActorEventType.REGISTERED, {
      actorId: actor.id,
      nature: input.identity.nature,
      status: actor.currentStatus,
      verification: actor.currentVerification,
    });

    return ok(actor);
  }

  /**
   * Rebuilds an actor from storage.
   *
   * Deliberately performs no checks and emits nothing: the state was already
   * legal when it was written, and re-validating on read would make a rule
   * change retroactively corrupt existing rows.
   */
  static rehydrate(snapshot: ActorSnapshot, deps: ActorDependencies): Actor {
    return new Actor(
      snapshot.id,
      snapshot.identity,
      snapshot.status,
      snapshot.verification,
      [...snapshot.contacts],
      snapshot.address,
      [...snapshot.roles],
      snapshot.version,
      deps,
    );
  }

  // --------------------------------------------------------------- accessors

  /** Immutable for the life of the actor — see `identity` in ADR terms. */
  get identity(): LegalIdentity {
    return this.legalIdentity;
  }

  get status(): ActorStatus {
    return this.currentStatus;
  }

  get verification(): VerificationLevel {
    return this.currentVerification;
  }

  /** A copy, so a caller cannot push a contact point past the invariant. */
  get contacts(): readonly ContactPoint[] {
    return [...this.currentContacts];
  }

  get address(): Address {
    return this.currentAddress;
  }

  /** A copy: the caller must not be able to add a role behind the rules. */
  get roles(): readonly ActorRole[] {
    return [...this.currentRoles];
  }

  get version(): number {
    return this.currentVersion;
  }

  /**
   * What the stored row should still hold, if nobody else wrote meanwhile.
   *
   * 0 for an actor that has never been persisted, which is what lets a
   * repository tell an insert from an update without a second question.
   */
  get expectedVersion(): number {
    return this.loadedVersion;
  }

  hasRole(type: RoleType): boolean {
    return hasRoleType(this.currentRoles, type);
  }

  role(type: RoleType): ActorRole | undefined {
    return findRole(this.currentRoles, type);
  }

  snapshot(): ActorSnapshot {
    return {
      id: this.id,
      identity: this.legalIdentity,
      status: this.currentStatus,
      verification: this.currentVerification,
      contacts: [...this.currentContacts],
      address: this.currentAddress,
      roles: [...this.currentRoles],
      version: this.currentVersion,
    };
  }

  // ------------------------------------------------------------------ events

  /**
   * Hands over the events this actor produced and forgets them.
   *
   * Draining rather than exposing the buffer: publishing twice is worse than
   * not publishing, and a getter invites exactly that.
   */
  pullEvents(): DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  // ------------------------------------------------------------------- roles

  /**
   * Refuses anything once the actor is closed.
   *
   * Called by every business mutation rather than by the status machine alone:
   * `checkTransition` already blocks a status change out of CLOSED, but it
   * says nothing about an address, a verification level or a role. Without
   * this, "CLOSED is terminal" would be true of the state diagram and false of
   * the record.
   */
  private refuseIfClosed(operation: string): ActorRuleViolation | undefined {
    if (!isTerminal(this.currentStatus)) {
      return undefined;
    }
    return ActorRuleViolation.violated(
      ActorRule.ACTOR_IS_CLOSED,
      `A closed actor cannot ${operation}.`,
    );
  }

  grantRole(input: {
    type: RoleType;
    grantedAt: IsoDate;
    qualification?: RoleQualification;
  }): Result<void, ActorRuleViolation> {
    if (!acceptsRoleGrant(this.currentStatus)) {
      // Without this, a suspension could be worked around by adding a role.
      return err(
        ActorRuleViolation.violated(
          ActorRule.ACTOR_STATUS_FORBIDS_ROLE_GRANT,
          `An actor in ${this.currentStatus} cannot be granted a role.`,
        ),
      );
    }

    if (this.hasRole(input.type)) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.ROLE_ALREADY_HELD,
          `The actor already holds the ${input.type} role.`,
        ),
      );
    }

    const role = grantRole({
      type: input.type,
      nature: this.legalIdentity.nature,
      verification: this.currentVerification,
      grantedAt: input.grantedAt,
      ...(input.qualification ? { qualification: input.qualification } : {}),
    });

    if (!role.ok) {
      return role;
    }

    this.currentRoles = [...this.currentRoles, role.value];
    this.record(ActorEventType.ROLE_GRANTED, {
      actorId: this.id,
      role: input.type,
    });

    return ok(undefined);
  }

  revokeRole(type: RoleType): Result<void, ActorRuleViolation> {
    const closed = this.refuseIfClosed('have a role revoked');
    if (closed) return err(closed);

    if (!this.hasRole(type)) {
      // Rejected rather than ignored: a no-op would hide a caller bug.
      return err(
        ActorRuleViolation.violated(
          ActorRule.ROLE_NOT_HELD,
          `The actor does not hold the ${type} role.`,
        ),
      );
    }

    // An ACTIVE actor with no role could act in no capacity at all, which is
    // what invariant 2 exists to prevent. Revoking the last one is refused
    // rather than silently suspending the actor.
    if (
      this.currentStatus === ActorStatus.ACTIVE &&
      this.currentRoles.length === 1
    ) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.ACTOR_NOT_ACTIVATABLE_WITHOUT_ROLE,
          'An active actor must keep at least one role; suspend or close it instead.',
        ),
      );
    }

    this.currentRoles = this.currentRoles.filter((role) => role.type !== type);
    this.record(ActorEventType.ROLE_REVOKED, { actorId: this.id, role: type });

    return ok(undefined);
  }

  // ------------------------------------------------------------ verification

  upgradeVerification(
    level: VerificationLevel,
  ): Result<void, ActorRuleViolation> {
    const closed = this.refuseIfClosed('be verified further');
    if (closed) return err(closed);

    if (!isVerificationUpgrade(this.currentVerification, level)) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.VERIFICATION_CANNOT_BE_LOWERED,
          `Verification only moves up; use revokeVerification to go from ${this.currentVerification} to ${level}.`,
        ),
      );
    }

    const from = this.currentVerification;
    this.currentVerification = level;
    this.record(ActorEventType.VERIFICATION_UPGRADED, {
      actorId: this.id,
      from,
      to: level,
    });

    return ok(undefined);
  }

  /**
   * Lowers verification, deliberately and with a stated cause.
   *
   * Separate from `upgradeVerification` because a silent downgrade is how a
   * fraud gets buried: making it a distinct operation that demands a reason
   * puts it in the event stream where someone can see it.
   *
   * Roles already granted are kept. Whether a role survives its actor losing
   * a verification level is a compliance decision, and taking it here would
   * hide it inside a setter.
   */
  revokeVerification(
    level: VerificationLevel,
    reason: string,
  ): Result<void, ActorRuleViolation> {
    const closed = this.refuseIfClosed('have its verification revoked');
    if (closed) return err(closed);

    if (!isVerificationUpgrade(level, this.currentVerification)) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.VERIFICATION_CANNOT_BE_LOWERED,
          `${level} is not below the current level ${this.currentVerification}.`,
        ),
      );
    }

    const from = this.currentVerification;
    this.currentVerification = level;
    this.record(ActorEventType.VERIFICATION_REVOKED, {
      actorId: this.id,
      from,
      to: level,
      reason,
    });

    return ok(undefined);
  }

  // ----------------------------------------------------------------- contact

  changeContacts(
    contacts: readonly ContactPoint[],
  ): Result<void, ActorRuleViolation> {
    const closed = this.refuseIfClosed('change its contacts');
    if (closed) return err(closed);

    const validated = contactPoints(contacts);
    if (!validated.ok) {
      return validated;
    }

    this.currentContacts = validated.value;
    this.record(ActorEventType.CONTACT_CHANGED, {
      actorId: this.id,
      // The channels and how many, never the values: contact details are
      // personal data, and an event stream is copied into places a phone
      // number should not reach.
      channels: channelsOf(validated.value),
      count: validated.value.length,
    });

    return ok(undefined);
  }

  changeAddress(address: Address): Result<void, ActorRuleViolation> {
    const closed = this.refuseIfClosed('change its address');
    if (closed) return err(closed);

    this.currentAddress = address;
    this.record(ActorEventType.ADDRESS_CHANGED, {
      actorId: this.id,
      // Region and country only, for the same reason as contacts: a street
      // line identifies a household.
      region: address.region,
      countryCode: address.countryCode,
    });

    return ok(undefined);
  }

  // --------------------------------------------------------------- lifecycle

  submitForVerification(): Result<void, ActorRuleViolation> {
    return this.moveTo(
      ActorStatus.PENDING_VERIFICATION,
      ActorEventType.SUBMITTED_FOR_VERIFICATION,
    );
  }

  activate(): Result<void, ActorRuleViolation> {
    if (this.currentRoles.length === 0) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.ACTOR_NOT_ACTIVATABLE_WITHOUT_ROLE,
          'An actor needs at least one role before it can be activated.',
        ),
      );
    }

    return this.moveTo(ActorStatus.ACTIVE, ActorEventType.ACTIVATED);
  }

  suspend(reason: string): Result<void, ActorRuleViolation> {
    return this.moveTo(ActorStatus.SUSPENDED, ActorEventType.SUSPENDED, reason);
  }

  reactivate(): Result<void, ActorRuleViolation> {
    return this.moveTo(ActorStatus.ACTIVE, ActorEventType.REACTIVATED);
  }

  close(reason: string): Result<void, ActorRuleViolation> {
    return this.moveTo(ActorStatus.CLOSED, ActorEventType.CLOSED, reason);
  }

  // ----------------------------------------------------------------- private

  private moveTo(
    to: ActorStatus,
    eventType: ActorEventTypeValue,
    reason?: string,
  ): Result<void, ActorRuleViolation> {
    const allowed = checkTransition(this.currentStatus, to);
    if (!allowed.ok) {
      return allowed;
    }

    const from = this.currentStatus;
    this.currentStatus = to;
    this.record(eventType, {
      actorId: this.id,
      from,
      to,
      ...(reason ? { reason } : {}),
    });

    return ok(undefined);
  }

  /**
   * Bumps the version and buffers the event, in that order.
   *
   * Every mutation goes through here, so "one mutation, one version bump, at
   * least one event" is structural rather than a rule each method remembers.
   * The event carries the version *after* the change, which is what lets a
   * consumer order a stream and spot a gap.
   */
  private record(
    eventType: ActorEventTypeValue,
    payload: Record<string, unknown>,
  ): void {
    this.currentVersion += 1;
    this.pending.push(
      buildDomainEvent(
        {
          eventType,
          aggregate: ACTOR_AGGREGATE,
          aggregateId: this.id,
          version: this.currentVersion,
          payload,
          occurredAt: this.deps.clock.nowIso(),
        },
        () => this.deps.ids.generate(),
      ),
    );
  }
}
