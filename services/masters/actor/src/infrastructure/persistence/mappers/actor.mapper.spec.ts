import {
  ActorNature,
  ActorRule,
  ActorStatus,
  LegalForm,
  VerificationLevel,
  actorId,
  address,
  companyIdentity,
  cooperativeIdentity,
  cooperativeRegistrationNumber,
  emailAddress,
  emailContact,
  isoDate,
  nif,
  personIdentity,
  personName,
  phoneContact,
  phoneNumber,
  rccm,
  type ActorSnapshot,
  type ContactPoint,
  type LegalIdentity,
} from '@nafa/foundation';
import {
  actorToRow,
  actorToSnapshot,
  nifOf,
  phoneNumbersOf,
  rccmOf,
  type ActorPrismaRow,
} from './actor.mapper';

function unwrap<T>(result: { ok: boolean; value?: T; error?: Error }): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error?.message}`);
  return result.value as T;
}

const ID = unwrap(actorId('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
const ADDRESS = unwrap(
  address({
    line: 'Quartier Almamya',
    locality: 'Conakry',
    region: 'Conakry',
    countryCode: 'GN',
  }),
);
const PHONE = phoneContact(unwrap(phoneNumber('+224620000000')));
const OTHER_PHONE = phoneContact(unwrap(phoneNumber('+224620000001')));
const EMAIL = emailContact(unwrap(emailAddress('contact@nafa.gn')));

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

const PERSON_WITHOUT_NIF: LegalIdentity = unwrap(
  personIdentity({
    name: unwrap(personName('Mamadou Alpha', 'Diallo')),
    birthDate: unwrap(
      isoDate('1985-03-17', ActorRule.INVALID_BIRTH_DATE, 'Birth'),
    ),
    nationality: 'GN',
  }),
);

function snapshotOf(
  identity: LegalIdentity,
  contacts: readonly ContactPoint[] = [PHONE],
): ActorSnapshot {
  return {
    id: ID,
    identity,
    status: ActorStatus.ACTIVE,
    verification: VerificationLevel.BASIC,
    contacts,
    address: ADDRESS,
    roles: [],
    version: 3,
  };
}

describe('the projected lookup columns', () => {
  it('takes the RCCM from a company and nothing else', () => {
    expect(rccmOf(COMPANY)).toBe('GN-CKY-2024-B-01234');
    // A cooperative is registered at RSCoop, not at the commercial register.
    // Projecting its number into the rccm column would make findByRccm
    // answer about two different registries.
    expect(rccmOf(COOPERATIVE)).toBeNull();
    expect(rccmOf(PERSON_WITHOUT_NIF)).toBeNull();
  });

  it('takes the NIF from every nature that carries one', () => {
    expect(nifOf(COMPANY)).toBe('123456789');
    expect(nifOf(COOPERATIVE)).toBe('987654321');
    // Optional for a person, and this one has none.
    expect(nifOf(PERSON_WITHOUT_NIF)).toBeNull();
  });

  it('keeps phone numbers, drops emails, and deduplicates', () => {
    expect(phoneNumbersOf([PHONE, EMAIL, OTHER_PHONE, PHONE])).toEqual([
      '+224620000000',
      '+224620000001',
    ]);
  });

  it('yields an empty array when no contact is a phone', () => {
    expect(phoneNumbersOf([EMAIL])).toEqual([]);
  });
});

describe('actorToRow', () => {
  it('writes the nature as its own column, taken from the identity', () => {
    expect(actorToRow(snapshotOf(COMPANY)).nature).toBe(ActorNature.COMPANY);
    expect(actorToRow(snapshotOf(COOPERATIVE)).nature).toBe(
      ActorNature.COOPERATIVE,
    );
    expect(actorToRow(snapshotOf(PERSON_WITHOUT_NIF)).nature).toBe(
      ActorNature.PERSON,
    );
  });

  it('projects the three lookup columns from the JSON it also writes', () => {
    const row = actorToRow(snapshotOf(COMPANY, [PHONE, EMAIL]));

    expect(row.rccm).toBe('GN-CKY-2024-B-01234');
    expect(row.nif).toBe('123456789');
    expect(row.phoneNumbers).toEqual(['+224620000000']);
    // The JSON stays the source of truth: the columns are derived from it,
    // and the identity crosses whole.
    expect(row.identity).toEqual(COMPANY);
  });
});

describe('the round trip', () => {
  it('returns the snapshot it was given', () => {
    const original = snapshotOf(COMPANY, [PHONE, EMAIL]);
    const row = actorToRow(original);

    // What Prisma hands back: the write, minus the projected columns the
    // mapper never reads.
    const stored: ActorPrismaRow = {
      id: row.id,
      nature: row.nature,
      identity: row.identity,
      address: row.address,
      contacts: row.contacts,
      roles: row.roles,
      status: row.status,
      verification: row.verification,
      version: row.version,
    };

    expect(actorToSnapshot(stored)).toEqual(original);
  });

  it('survives a JSON encode and decode, which is what Postgres does', () => {
    const original = snapshotOf(COOPERATIVE, [PHONE]);
    const row = actorToRow(original);
    const roundTripped = JSON.parse(JSON.stringify(row)) as typeof row;

    expect(
      actorToSnapshot({
        id: roundTripped.id,
        nature: roundTripped.nature,
        identity: roundTripped.identity,
        address: roundTripped.address,
        contacts: roundTripped.contacts,
        roles: roundTripped.roles,
        status: roundTripped.status,
        verification: roundTripped.verification,
        version: roundTripped.version,
      }),
    ).toEqual(original);
  });
});
