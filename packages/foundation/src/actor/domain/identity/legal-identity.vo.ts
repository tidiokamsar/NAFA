import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';
import {
  isCooperativeForm,
  type CooperativeRegistrationNumber,
  type IsoDate,
  type LegalForm,
  type Nif,
  type PersonName,
  type Rccm,
} from '../value-objects';

/**
 * What an actor *is*, as opposed to what it does.
 *
 * A closed union rather than a class hierarchy: the three natures are not
 * variations of one another, they are governed by different law and carry
 * different identifiers. A discriminated union makes the compiler force every
 * caller to handle all three, which inheritance and a shared base class do
 * not.
 *
 * Immutable once the actor exists. Changing nature is not an update — it is a
 * different legal entity, and pretending otherwise silently rewrites history.
 */
export const ActorNature = {
  PERSON: 'PERSON',
  COMPANY: 'COMPANY',
  COOPERATIVE: 'COOPERATIVE',
} as const;

export type ActorNature = (typeof ActorNature)[keyof typeof ActorNature];

/** A natural person. */
export interface PersonIdentity {
  readonly nature: typeof ActorNature.PERSON;
  readonly name: PersonName;
  readonly birthDate: IsoDate;
  /** ISO 3166-1 alpha-2. */
  readonly nationality: string;
  /** Present when the person registered as a trader in their own name. */
  readonly nif?: Nif;
}

/** A commercial company, entered in the RCCM. */
export interface CompanyIdentity {
  readonly nature: typeof ActorNature.COMPANY;
  readonly legalName: string;
  readonly tradeName?: string;
  readonly legalForm: LegalForm;
  readonly rccm: Rccm;
  readonly nif: Nif;
  readonly incorporationDate: IsoDate;
}

/** A cooperative society, entered in the cooperative register. */
export interface CooperativeIdentity {
  readonly nature: typeof ActorNature.COOPERATIVE;
  readonly name: string;
  readonly legalForm: LegalForm;
  readonly registrationNumber: CooperativeRegistrationNumber;
  readonly nif: Nif;
  readonly incorporationDate: IsoDate;
}

export type LegalIdentity =
  PersonIdentity | CompanyIdentity | CooperativeIdentity;

export function isPerson(identity: LegalIdentity): identity is PersonIdentity {
  return identity.nature === ActorNature.PERSON;
}

export function isCompany(
  identity: LegalIdentity,
): identity is CompanyIdentity {
  return identity.nature === ActorNature.COMPANY;
}

export function isCooperative(
  identity: LegalIdentity,
): identity is CooperativeIdentity {
  return identity.nature === ActorNature.COOPERATIVE;
}

/** The name to show for any nature, without the caller switching on it. */
export function displayName(identity: LegalIdentity): string {
  switch (identity.nature) {
    case ActorNature.PERSON:
      return `${identity.name.givenNames} ${identity.name.familyName}`;
    case ActorNature.COMPANY:
      return identity.tradeName ?? identity.legalName;
    case ActorNature.COOPERATIVE:
      return identity.name;
  }
}

/** The tax identifier, where the nature has one. */
export function taxIdentifier(identity: LegalIdentity): Nif | undefined {
  return identity.nif;
}

const NAME_MAX_LENGTH = 200;

function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function personIdentity(input: {
  name: PersonName;
  birthDate: IsoDate;
  nationality: string;
  nif?: Nif;
}): Result<PersonIdentity, ActorRuleViolation> {
  const nationality = input.nationality.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(nationality)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_PERSON_NAME,
        'Nationality must be an ISO 3166-1 alpha-2 code, e.g. GN.',
      ),
    );
  }

  return ok({
    nature: ActorNature.PERSON,
    name: input.name,
    birthDate: input.birthDate,
    nationality,
    ...(input.nif ? { nif: input.nif } : {}),
  });
}

export function companyIdentity(input: {
  legalName: string;
  tradeName?: string;
  legalForm: LegalForm;
  rccm: Rccm;
  nif: Nif;
  incorporationDate: IsoDate;
}): Result<CompanyIdentity, ActorRuleViolation> {
  const legalName = cleanName(input.legalName);

  if (legalName.length === 0 || legalName.length > NAME_MAX_LENGTH) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_LEGAL_FORM,
        `A legal name is required and cannot exceed ${NAME_MAX_LENGTH} characters.`,
      ),
    );
  }

  // The cooperative forms belong to a different register and a different
  // uniform act. Accepting one here would produce a company that is legally a
  // cooperative — the exact confusion the three natures exist to prevent.
  if (isCooperativeForm(input.legalForm)) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.LEGAL_FORM_NOT_ALLOWED_FOR_NATURE,
        `${input.legalForm} is a cooperative form; register the actor as a cooperative.`,
      ),
    );
  }

  const tradeName = input.tradeName ? cleanName(input.tradeName) : undefined;

  return ok({
    nature: ActorNature.COMPANY,
    legalName,
    ...(tradeName ? { tradeName } : {}),
    legalForm: input.legalForm,
    rccm: input.rccm,
    nif: input.nif,
    incorporationDate: input.incorporationDate,
  });
}

export function cooperativeIdentity(input: {
  name: string;
  legalForm: LegalForm;
  registrationNumber: CooperativeRegistrationNumber;
  nif: Nif;
  incorporationDate: IsoDate;
}): Result<CooperativeIdentity, ActorRuleViolation> {
  const name = cleanName(input.name);

  if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_LEGAL_FORM,
        `A cooperative name is required and cannot exceed ${NAME_MAX_LENGTH} characters.`,
      ),
    );
  }

  if (!isCooperativeForm(input.legalForm)) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.LEGAL_FORM_NOT_ALLOWED_FOR_NATURE,
        `${input.legalForm} is a company form; a cooperative must be SCOOPS or SCOOPCA.`,
      ),
    );
  }

  return ok({
    nature: ActorNature.COOPERATIVE,
    name,
    legalForm: input.legalForm,
    registrationNumber: input.registrationNumber,
    nif: input.nif,
    incorporationDate: input.incorporationDate,
  });
}
