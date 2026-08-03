import type { Result } from '@nafa/shared';
import { Actor, type ActorDependencies } from '../actor.aggregate';
import type { ActorRuleViolation } from '../actor.errors';
import { ActorRule } from '../actor.errors';
import {
  companyIdentity,
  cooperativeIdentity,
  personIdentity,
  type LegalIdentity,
} from '../identity';
import type { ActorUniquenessChecker } from '../services/actor-uniqueness.checker';
import {
  actorId,
  address,
  contactPoints,
  cooperativeRegistrationNumber,
  emailAddress,
  emailContact,
  isoDate,
  legalForm,
  nif,
  personName,
  phoneContact,
  phoneNumber,
  rccm,
  type ActorId,
  type ContactPoint,
} from '../value-objects';

/** Raw input, as it arrives from a form, a CSV import or a USSD session. */
export interface RawAddress {
  line?: string;
  locality: string;
  region: string;
  countryCode: string;
}

export interface RawContacts {
  phones?: readonly string[];
  emails?: readonly string[];
}

export interface CreatePersonInput {
  givenNames: string;
  familyName: string;
  birthDate: string;
  nationality: string;
  /** Only when the person registers as a trader in their own name. */
  taxIdentifier?: string;
  contacts: RawContacts;
  address: RawAddress;
}

export interface CreateCompanyInput {
  legalName: string;
  tradeName?: string;
  legalForm: string;
  rccm: string;
  taxIdentifier: string;
  incorporationDate: string;
  contacts: RawContacts;
  address: RawAddress;
}

export interface CreateCooperativeInput {
  name: string;
  legalForm: string;
  registrationNumber: string;
  taxIdentifier: string;
  incorporationDate: string;
  contacts: RawContacts;
  address: RawAddress;
}

/**
 * The single door into the actor registry.
 *
 * It takes raw strings rather than value objects on purpose. Accepting
 * already-built value objects would mean the caller had to construct them,
 * and a caller that can construct them can construct half of them and stop —
 * which is exactly the invalid object this factory exists to prevent. Taking
 * the raw input makes "every actor in the system was validated" a property of
 * the code rather than a convention.
 *
 * Identifiers come from `IdGenerator` and timestamps from `Clock`, both
 * injected, so a test can assert the exact id and instant without freezing
 * global state.
 */
export class ActorFactory {
  constructor(
    private readonly uniqueness: ActorUniquenessChecker,
    private readonly deps: ActorDependencies,
  ) {}

  async createPerson(
    input: CreatePersonInput,
  ): Promise<Result<Actor, ActorRuleViolation>> {
    const name = personName(input.givenNames, input.familyName);
    if (!name.ok) return name;

    const birthDate = isoDate(
      input.birthDate,
      ActorRule.INVALID_BIRTH_DATE,
      'Birth date',
    );
    if (!birthDate.ok) return birthDate;

    let taxIdentifier;
    if (input.taxIdentifier !== undefined) {
      const parsed = nif(input.taxIdentifier);
      if (!parsed.ok) return parsed;
      taxIdentifier = parsed.value;
    }

    const identity = personIdentity({
      name: name.value,
      birthDate: birthDate.value,
      nationality: input.nationality,
      ...(taxIdentifier ? { nif: taxIdentifier } : {}),
    });
    if (!identity.ok) return identity;

    return this.assemble(identity.value, input.contacts, input.address);
  }

  async createCompany(
    input: CreateCompanyInput,
  ): Promise<Result<Actor, ActorRuleViolation>> {
    const form = legalForm(input.legalForm);
    if (!form.ok) return form;

    const register = rccm(input.rccm);
    if (!register.ok) return register;

    const taxIdentifier = nif(input.taxIdentifier);
    if (!taxIdentifier.ok) return taxIdentifier;

    const incorporationDate = isoDate(
      input.incorporationDate,
      ActorRule.INVALID_INCORPORATION_DATE,
      'Incorporation date',
    );
    if (!incorporationDate.ok) return incorporationDate;

    const identity = companyIdentity({
      legalName: input.legalName,
      ...(input.tradeName ? { tradeName: input.tradeName } : {}),
      legalForm: form.value,
      rccm: register.value,
      nif: taxIdentifier.value,
      incorporationDate: incorporationDate.value,
    });
    if (!identity.ok) return identity;

    return this.assemble(identity.value, input.contacts, input.address);
  }

  async createCooperative(
    input: CreateCooperativeInput,
  ): Promise<Result<Actor, ActorRuleViolation>> {
    const form = legalForm(input.legalForm);
    if (!form.ok) return form;

    const register = cooperativeRegistrationNumber(input.registrationNumber);
    if (!register.ok) return register;

    const taxIdentifier = nif(input.taxIdentifier);
    if (!taxIdentifier.ok) return taxIdentifier;

    const incorporationDate = isoDate(
      input.incorporationDate,
      ActorRule.INVALID_INCORPORATION_DATE,
      'Incorporation date',
    );
    if (!incorporationDate.ok) return incorporationDate;

    const identity = cooperativeIdentity({
      name: input.name,
      legalForm: form.value,
      registrationNumber: register.value,
      nif: taxIdentifier.value,
      incorporationDate: incorporationDate.value,
    });
    if (!identity.ok) return identity;

    return this.assemble(identity.value, input.contacts, input.address);
  }

  /**
   * The part every nature shares: contacts, address, uniqueness, then the
   * aggregate's own registration rules.
   *
   * Uniqueness is checked last of the validations and first of the writes —
   * there is no point asking the registry about an identity that is not even
   * well-formed.
   */
  private async assemble(
    identity: LegalIdentity,
    rawContacts: RawContacts,
    rawAddress: RawAddress,
  ): Promise<Result<Actor, ActorRuleViolation>> {
    const contacts = this.buildContacts(rawContacts);
    if (!contacts.ok) return contacts;

    const location = address({
      line: rawAddress.line ?? '',
      locality: rawAddress.locality,
      region: rawAddress.region,
      countryCode: rawAddress.countryCode,
    });
    if (!location.ok) return location;

    const unique = await this.uniqueness.checkIdentity(identity);
    if (!unique.ok) return unique;

    const id = actorId(this.deps.ids.generate());
    if (!id.ok) return id;

    return Actor.register(
      {
        id: id.value as ActorId,
        identity,
        contacts: contacts.value,
        address: location.value,
      },
      this.deps,
    );
  }

  private buildContacts(
    raw: RawContacts,
  ): Result<readonly ContactPoint[], ActorRuleViolation> {
    const points: ContactPoint[] = [];

    for (const value of raw.phones ?? []) {
      const parsed = phoneNumber(value);
      if (!parsed.ok) return parsed;
      points.push(phoneContact(parsed.value));
    }

    for (const value of raw.emails ?? []) {
      const parsed = emailAddress(value);
      if (!parsed.ok) return parsed;
      points.push(emailContact(parsed.value));
    }

    return contactPoints(points);
  }
}
