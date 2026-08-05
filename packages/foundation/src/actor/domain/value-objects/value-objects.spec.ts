import { isErr, isOk } from '@nafa/shared';
import { ActorRule } from '../actor.errors';
import { actorId } from './actor-id.vo';
import { address } from './address.vo';
import { cooperativeRegistrationNumber } from './cooperative-registration-number.vo';
import { emailAddress } from './email-address.vo';
import { isoDate } from './iso-date.vo';
import { LegalForm, isCooperativeForm, legalForm } from './legal-form.vo';
import { nif } from './nif.vo';
import { personName } from './person-name.vo';
import { phoneNumber } from './phone-number.vo';
import { rccm } from './rccm.vo';

/** Unwraps a Result the test expects to have succeeded. */
function expectOk<T>(result: {
  ok: boolean;
  value?: T;
  error?: { message: string };
}): T {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error?.message}`);
  }
  return result.value as T;
}

describe('ActorId', () => {
  it('accepts a UUID and lowercases it so two spellings compare equal', () => {
    const upper = actorId('3F2504E0-4F89-41D3-9A0C-0305E82C3301');
    const lower = actorId('3f2504e0-4f89-41d3-9a0c-0305e82c3301');

    expect(expectOk(upper)).toBe(expectOk(lower));
  });

  it.each([
    ['not a uuid', 'abc'],
    ['wrong length', '3f2504e0-4f89-41d3-9a0c'],
    ['empty', ''],
  ])('rejects %s', (_label, raw) => {
    const result = actorId(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.INVALID_ACTOR_ID);
    }
  });
});

describe('PhoneNumber', () => {
  it.each([
    ['spaces', '+224 620 00 00 00'],
    ['dashes', '+224-620-00-00-00'],
    ['parentheses', '+224 (620) 00.00.00'],
  ])('normalises %s to the same canonical form', (_label, raw) => {
    expect(expectOk(phoneNumber(raw))).toBe('+224620000000');
  });

  it('accepts numbers outside Guinea', () => {
    // NAFA has cross-border actors; a +224-only rule would reject a Malian
    // transporter at registration.
    expect(isOk(phoneNumber('+22370000000'))).toBe(true);
  });

  it.each([
    ['no plus', '224620000000'],
    ['leading zero country code', '+0224620000'],
    ['too short', '+2246'],
    ['letters', '+224ABCDEFGH'],
  ])('rejects %s', (_label, raw) => {
    const result = phoneNumber(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.INVALID_PHONE_NUMBER);
    }
  });
});

describe('EmailAddress', () => {
  it('lowercases and trims', () => {
    expect(expectOk(emailAddress('  Fatou.Barry@NAFA.GN '))).toBe(
      'fatou.barry@nafa.gn',
    );
  });

  it.each([
    ['no at sign', 'fatou.nafa.gn'],
    ['no domain dot', 'fatou@nafa'],
    ['inner space', 'fa tou@nafa.gn'],
    ['empty', ''],
  ])('rejects %s', (_label, raw) => {
    expect(isErr(emailAddress(raw))).toBe(true);
  });
});

describe('PersonName', () => {
  it('collapses whitespace so two spellings compare equal', () => {
    const name = expectOk(personName('  Mamadou   Alpha ', ' Diallo '));

    expect(name.givenNames).toBe('Mamadou Alpha');
    expect(name.familyName).toBe('Diallo');
  });

  it.each([
    ['blank given names', '   ', 'Diallo'],
    ['blank family name', 'Mamadou', '  '],
  ])('rejects %s', (_label, given, family) => {
    const result = personName(given, family);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.INVALID_PERSON_NAME);
    }
  });
});

describe('Address', () => {
  it('accepts an address with no street line', () => {
    // Much of NAFA's territory has no named streets. Requiring a line would
    // make rural actors unregisterable.
    const result = address({
      line: '',
      locality: 'Kindia',
      region: 'Kindia',
      countryCode: 'gn',
    });

    expect(expectOk(result).countryCode).toBe('GN');
  });

  it.each([
    ['missing locality', { locality: '', region: 'Kindia', countryCode: 'GN' }],
    ['missing region', { locality: 'Kindia', region: '', countryCode: 'GN' }],
    [
      'bad country code',
      { locality: 'Kindia', region: 'Kindia', countryCode: 'GIN' },
    ],
  ])('rejects %s', (_label, partial) => {
    const result = address({ line: 'Quartier Manquepas', ...partial });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.INVALID_ADDRESS);
    }
  });
});

describe('Rccm', () => {
  it('canonicalises separators and case', () => {
    expect(expectOk(rccm('gn/cky/2024/b/01234'))).toBe('GN-CKY-2024-B-01234');
  });

  it('rejects a number that is not in OHADA form', () => {
    const result = rccm('123456');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.INVALID_RCCM);
    }
  });
});

describe('Nif', () => {
  it('strips punctuation so two spellings collide', () => {
    // Uniqueness across the registry is an invariant; without normalisation
    // the check would be decorative.
    expect(expectOk(nif('123.456.789'))).toBe(expectOk(nif('123456789')));
  });

  it.each([
    ['too short', '1234'],
    ['letters', '12345678A'],
  ])('rejects %s', (_label, raw) => {
    expect(isErr(nif(raw))).toBe(true);
  });
});

describe('CooperativeRegistrationNumber', () => {
  it('accepts the cooperative register forms', () => {
    expect(
      expectOk(cooperativeRegistrationNumber('GN-KND-2024-SCOOPS-00123')),
    ).toBe('GN-KND-2024-SCOOPS-00123');
  });

  it('rejects a commercial RCCM number', () => {
    // A cooperative is not entered in the RCCM. Accepting one here would
    // erase the distinction between two different uniform acts.
    const result = cooperativeRegistrationNumber('GN-CKY-2024-B-01234');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(
        ActorRule.INVALID_COOPERATIVE_REGISTRATION,
      );
    }
  });
});

describe('LegalForm', () => {
  it('accepts a known form, case-insensitively', () => {
    expect(expectOk(legalForm('sarl'))).toBe(LegalForm.SARL);
  });

  it('rejects an unknown form', () => {
    const result = legalForm('LLC');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.rule).toBe(ActorRule.INVALID_LEGAL_FORM);
    }
  });

  it('separates cooperative forms from company forms', () => {
    expect(isCooperativeForm(LegalForm.SCOOPS)).toBe(true);
    expect(isCooperativeForm(LegalForm.SCOOPCA)).toBe(true);
    expect(isCooperativeForm(LegalForm.SARL)).toBe(false);
    expect(isCooperativeForm(LegalForm.GIE)).toBe(false);
  });
});

describe('IsoDate', () => {
  const rule = ActorRule.INVALID_BIRTH_DATE;

  it('accepts a real date', () => {
    expect(expectOk(isoDate('1985-03-17', rule, 'Birth date'))).toBe(
      '1985-03-17',
    );
  });

  it('rejects a date that matches the shape but does not exist', () => {
    // Date would silently roll 2025-02-30 into March; round-tripping catches
    // what the pattern cannot.
    expect(isErr(isoDate('2025-02-30', rule, 'Birth date'))).toBe(true);
  });

  it.each([
    ['a timestamp', '1985-03-17T00:00:00Z'],
    ['a slashed date', '17/03/1985'],
    ['a short year', '85-03-17'],
  ])('rejects %s', (_label, raw) => {
    expect(isErr(isoDate(raw, rule, 'Birth date'))).toBe(true);
  });
});
