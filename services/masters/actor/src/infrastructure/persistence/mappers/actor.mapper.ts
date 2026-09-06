import {
  ActorNature,
  ContactChannel,
  type ActorSnapshot,
  type ContactPoint,
  type LegalIdentity,
} from '@nafa/foundation';

/** The structural subset of a Prisma row the mapper reads. */
export interface ActorPrismaRow {
  readonly id: string;
  readonly nature: string;
  readonly identity: unknown;
  readonly address: unknown;
  readonly contacts: unknown;
  readonly roles: unknown;
  readonly status: string;
  readonly verification: string;
  readonly version: number;
}

/** What the mapper writes. The three projected columns are derived, never given. */
export interface ActorPrismaWrite {
  readonly id: string;
  readonly nature: string;
  readonly identity: unknown;
  readonly address: unknown;
  readonly contacts: unknown;
  readonly roles: unknown;
  readonly status: string;
  readonly verification: string;
  readonly rccm: string | null;
  readonly nif: string | null;
  readonly phoneNumbers: string[];
  readonly version: number;
}

/**
 * The commercial register number, when the actor has one.
 *
 * Only a company does. A cooperative carries a `registrationNumber` from a
 * different registry (RSCoop) and a person carries neither, so both project
 * to null — `findByRccm` is a question about companies whether or not the
 * caller knows it.
 */
export function rccmOf(identity: LegalIdentity): string | null {
  return identity.nature === ActorNature.COMPANY ? identity.rccm : null;
}

/**
 * The tax identifier, when the actor has one.
 *
 * Required for a company and a cooperative, optional for a person — the
 * domain decides which, this only reads what is there.
 */
export function nifOf(identity: LegalIdentity): string | null {
  return identity.nature === ActorNature.PERSON
    ? (identity.nif ?? null)
    : identity.nif;
}

/**
 * Every phone number the actor can be reached on.
 *
 * Deduplicated, because the column is searched with a containment test and a
 * repeated value would only make the index bigger.
 */
export function phoneNumbersOf(contacts: readonly ContactPoint[]): string[] {
  return [
    ...new Set(
      contacts
        .filter((point) => point.channel === ContactChannel.PHONE)
        .map((point) => point.value as string),
    ),
  ];
}

/**
 * Maps between the domain snapshot and the persistence row.
 *
 * The identity, address, contacts and roles cross as JSON: they are value
 * objects inside the aggregate's boundary, and flattening them across columns
 * would buy nothing the database ever queries.
 *
 * `rccm`, `nif` and `phoneNumbers` are the exception, and they are a
 * *projection*: computed here on every write, never read back on the way in.
 * The JSON stays the single source of truth — the columns exist so the
 * database can answer the three uniqueness questions in ActorRepository, and
 * a divergence between the two would be this function's bug, not a state the
 * aggregate can reach.
 */
export function actorToRow(snapshot: ActorSnapshot): ActorPrismaWrite {
  return {
    id: snapshot.id,
    nature: snapshot.identity.nature,
    identity: snapshot.identity,
    address: snapshot.address,
    contacts: snapshot.contacts,
    roles: snapshot.roles,
    status: snapshot.status,
    verification: snapshot.verification,
    rccm: rccmOf(snapshot.identity),
    nif: nifOf(snapshot.identity),
    phoneNumbers: phoneNumbersOf(snapshot.contacts),
    version: snapshot.version,
  };
}

export function actorToSnapshot(row: ActorPrismaRow): ActorSnapshot {
  return {
    id: row.id as ActorSnapshot['id'],
    identity: row.identity as LegalIdentity,
    status: row.status as ActorSnapshot['status'],
    verification: row.verification as ActorSnapshot['verification'],
    contacts: row.contacts as readonly ContactPoint[],
    address: row.address as ActorSnapshot['address'],
    roles: row.roles as ActorSnapshot['roles'],
    version: row.version,
  };
}
