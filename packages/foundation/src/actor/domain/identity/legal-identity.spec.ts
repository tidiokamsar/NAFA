import { isErr } from '@nafa/shared';
import { ActorRule } from '../actor.errors';
import {
  cooperativeRegistrationNumber,
  isoDate,
  LegalForm,
  nif,
  personName,
  rccm,
  type CooperativeRegistrationNumber,
  type IsoDate,
  type Nif,
  type PersonName,
  type Rccm,
} from '../value-objects';
import {
  ActorNature,
  companyIdentity,
  cooperativeIdentity,
  displayName,
  isCompany,
  isCooperative,
  isPerson,
  personIdentity,
  taxIdentifier,
} from './legal-identity.vo';

function unwrap<T>(result: {
  ok: boolean;
  value?: T;
  error?: { message: string };
}): T {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error?.message}`);
  }
  return result.value as T;
}

const NAME: PersonName = unwrap(personName('Mamadou Alpha', 'Diallo'));
const BIRTH: IsoDate = unwrap(
  isoDate('1985-03-17', ActorRule.INVALID_BIRTH_DATE, 'Birth date'),
);
const INCORPORATED: IsoDate = unwrap(
  isoDate('2019-06-01', ActorRule.INVALID_INCORPORATION_DATE, 'Incorporation'),
);
const RCCM: Rccm = unwrap(rccm('GN-CKY-2024-B-01234'));
const NIF: Nif = unwrap(nif('123456789'));
const COOP_REG: CooperativeRegistrationNumber = unwrap(
  cooperativeRegistrationNumber('GN-KND-2024-SCOOPS-00123'),
);

describe('PersonIdentity', () => {
  it('is discriminated as a person and narrows', () => {
    const identity = unwrap(
      personIdentity({ name: NAME, birthDate: BIRTH, nationality: 'gn' }),
    );

    expect(identity.nature).toBe(ActorNature.PERSON);
    expect(isPerson(identity)).toBe(true);
    expect(isCompany(identity)).toBe(false);
    expect(isCooperative(identity)).toBe(false);
    expect(identity.nationality).toBe('GN');
  });

  it('has no tax identifier unless the person registered as a trader', () => {
    const plain = unwrap(
      personIdentity({ name: NAME, birthDate: BIRTH, nationality: 'GN' }),
    );
    const trader = unwrap(
      personIdentity({
        name: NAME,
        birthDate: BIRTH,
        nationality: 'GN',
        nif: NIF,
      }),
    );

    expect(taxIdentifier(plain)).toBeUndefined();
    expect(taxIdentifier(trader)).toBe(NIF);
  });

  it('rejects a nationality that is not an alpha-2 code', () => {
    expect(
      isErr(
        personIdentity({ name: NAME, birthDate: BIRTH, nationality: 'GIN' }),
      ),
    ).toBe(true);
  });
});

describe('CompanyIdentity', () => {
  const valid = {
    legalName: '  Société   Kaloum  Négoce ',
    legalForm: LegalForm.SARL,
    rccm: RCCM,
    nif: NIF,
    incorporationDate: INCORPORATED,
  };

  it('collapses whitespace in the legal name', () => {
    expect(unwrap(companyIdentity(valid)).legalName).toBe(
      'Société Kaloum Négoce',
    );
  });

  it('shows the trade name when there is one, the legal name otherwise', () => {
    const plain = unwrap(companyIdentity(valid));
    const branded = unwrap(companyIdentity({ ...valid, tradeName: 'Kaloum' }));

    expect(displayName(plain)).toBe('Société Kaloum Négoce');
    expect(displayName(branded)).toBe('Kaloum');
  });

  it.each([LegalForm.SCOOPS, LegalForm.SCOOPCA])(
    'refuses the cooperative form %s',
    (form) => {
      // Accepting it would produce a company that is legally a cooperative —
      // the exact confusion the three natures exist to prevent.
      const result = companyIdentity({ ...valid, legalForm: form });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.rule).toBe(
          ActorRule.LEGAL_FORM_NOT_ALLOWED_FOR_NATURE,
        );
      }
    },
  );

  it('requires a legal name', () => {
    expect(isErr(companyIdentity({ ...valid, legalName: '   ' }))).toBe(true);
  });
});

describe('CooperativeIdentity', () => {
  const valid = {
    name: 'Coopérative des Producteurs de Kindia',
    legalForm: LegalForm.SCOOPS,
    registrationNumber: COOP_REG,
    nif: NIF,
    incorporationDate: INCORPORATED,
  };

  it('is discriminated as a cooperative and narrows', () => {
    const identity = unwrap(cooperativeIdentity(valid));

    expect(identity.nature).toBe(ActorNature.COOPERATIVE);
    expect(isCooperative(identity)).toBe(true);
    expect(isPerson(identity)).toBe(false);
    expect(displayName(identity)).toBe('Coopérative des Producteurs de Kindia');
  });

  it.each([LegalForm.SARL, LegalForm.SA, LegalForm.GIE, LegalForm.EI])(
    'refuses the company form %s',
    (form) => {
      const result = cooperativeIdentity({ ...valid, legalForm: form });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.rule).toBe(
          ActorRule.LEGAL_FORM_NOT_ALLOWED_FOR_NATURE,
        );
      }
    },
  );
});

describe('LegalIdentity as a closed union', () => {
  it('gives every nature a display name without the caller switching', () => {
    const identities = [
      unwrap(
        personIdentity({ name: NAME, birthDate: BIRTH, nationality: 'GN' }),
      ),
      unwrap(
        companyIdentity({
          legalName: 'Kaloum Négoce',
          legalForm: LegalForm.SARL,
          rccm: RCCM,
          nif: NIF,
          incorporationDate: INCORPORATED,
        }),
      ),
      unwrap(
        cooperativeIdentity({
          name: 'Coopérative de Kindia',
          legalForm: LegalForm.SCOOPCA,
          registrationNumber: COOP_REG,
          nif: NIF,
          incorporationDate: INCORPORATED,
        }),
      ),
    ];

    expect(identities.map(displayName)).toEqual([
      'Mamadou Alpha Diallo',
      'Kaloum Négoce',
      'Coopérative de Kindia',
    ]);
  });
});
