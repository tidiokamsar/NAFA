import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * Legal forms available under OHADA company law, plus the two cooperative
 * forms from the cooperative uniform act.
 *
 * An enumeration rather than a free string: the form decides which register
 * the actor belongs in and which roles it may hold, so it has to be a closed
 * set the domain can reason about.
 */
export const LegalForm = {
  /** Entreprise individuelle — a trader operating in their own name. */
  EI: 'EI',
  /** Société à responsabilité limitée. */
  SARL: 'SARL',
  /** SARL with a single partner. */
  SARLU: 'SARLU',
  /** Société anonyme. */
  SA: 'SA',
  /** Société par actions simplifiée. */
  SAS: 'SAS',
  /** Groupement d'intérêt économique. */
  GIE: 'GIE',
  /** Société coopérative simplifiée. */
  SCOOPS: 'SCOOPS',
  /** Société coopérative avec conseil d'administration. */
  SCOOPCA: 'SCOOPCA',
} as const;

export type LegalForm = (typeof LegalForm)[keyof typeof LegalForm];

/** Forms that make the holder a cooperative rather than a company. */
const COOPERATIVE_FORMS: readonly LegalForm[] = [
  LegalForm.SCOOPS,
  LegalForm.SCOOPCA,
];

export function isCooperativeForm(form: LegalForm): boolean {
  return COOPERATIVE_FORMS.includes(form);
}

export function legalForm(raw: string): Result<LegalForm, ActorRuleViolation> {
  const candidate = raw.trim().toUpperCase();

  if (!Object.values(LegalForm).includes(candidate as LegalForm)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_LEGAL_FORM,
        `Unknown legal form "${raw}". Expected one of ${Object.values(LegalForm).join(', ')}.`,
      ),
    );
  }

  return ok(candidate as LegalForm);
}
