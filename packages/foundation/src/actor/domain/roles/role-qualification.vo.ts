import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';
import { RoleType } from './role-type.vo';

/**
 * What *kind* of producer, transporter or financial institution the actor is.
 *
 * A qualification is not a measurement. It answers "which species of this
 * role", and it only changes when the actor changes trade — never with the
 * season, the harvest or the size of the business. That is the line between
 * this and the operational data owned by other masters: surface area, tonnage,
 * commodities, fleets and warehouses all move with activity and live
 * elsewhere.
 *
 * Only three of the seven roles carry one. The other four are fully described
 * by their type, and inventing a qualification for them to make the model
 * symmetrical would be inventing data.
 */

/** What a producer produces, at the level that decides its legal regime. */
export const ProductionKind = {
  /** Farming — the category, not the commodities grown. */
  CROP: 'CROP',
  LIVESTOCK: 'LIVESTOCK',
  FISHERY: 'FISHERY',
  /** Transforms raw output into goods. */
  PROCESSING: 'PROCESSING',
} as const;

export type ProductionKind =
  (typeof ProductionKind)[keyof typeof ProductionKind];

/**
 * How a transporter carries.
 *
 * The mode, not the fleet: transport authorisations are issued per mode, and
 * a road licence does not cover river traffic. How many vehicles the actor
 * owns is a logistics concern.
 */
export const TransportMode = {
  ROAD: 'ROAD',
  RIVER: 'RIVER',
  SEA: 'SEA',
  AIR: 'AIR',
} as const;

export type TransportMode = (typeof TransportMode)[keyof typeof TransportMode];

/**
 * What kind of financial institution.
 *
 * The single most consequential qualification in this context. In Guinea,
 * Orange Money and MTN MoMo are electronic money issuers, not banks: a
 * different central-bank licence, different limits, different obligations.
 * Collapsing them under one FINANCIAL role with no qualification would erase
 * a distinction the business depends on.
 */
export const InstitutionKind = {
  BANK: 'BANK',
  MICROFINANCE: 'MICROFINANCE',
  /** Établissement de monnaie électronique — mobile money. */
  EMI: 'EMI',
} as const;

export type InstitutionKind =
  (typeof InstitutionKind)[keyof typeof InstitutionKind];

export interface ProducerQualification {
  readonly role: typeof RoleType.PRODUCER;
  readonly kinds: readonly ProductionKind[];
}

export interface TransporterQualification {
  readonly role: typeof RoleType.TRANSPORTER;
  readonly modes: readonly TransportMode[];
}

export interface FinancialQualification {
  readonly role: typeof RoleType.FINANCIAL;
  readonly institutionKind: InstitutionKind;
}

export type RoleQualification =
  ProducerQualification | TransporterQualification | FinancialQualification;

/** Role types that must carry a qualification, and only those. */
export const QUALIFIED_ROLE_TYPES: readonly RoleType[] = [
  RoleType.PRODUCER,
  RoleType.TRANSPORTER,
  RoleType.FINANCIAL,
];

export function requiresQualification(type: RoleType): boolean {
  return QUALIFIED_ROLE_TYPES.includes(type);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function producerQualification(
  kinds: readonly ProductionKind[],
): Result<ProducerQualification, ActorRuleViolation> {
  const distinct = unique(kinds);

  if (distinct.length === 0) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.ROLE_QUALIFICATION_EMPTY,
        'A producer must declare at least one kind of production.',
      ),
    );
  }

  return ok({ role: RoleType.PRODUCER, kinds: distinct });
}

export function transporterQualification(
  modes: readonly TransportMode[],
): Result<TransporterQualification, ActorRuleViolation> {
  const distinct = unique(modes);

  if (distinct.length === 0) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.ROLE_QUALIFICATION_EMPTY,
        'A transporter must declare at least one transport mode.',
      ),
    );
  }

  return ok({ role: RoleType.TRANSPORTER, modes: distinct });
}

export function financialQualification(
  institutionKind: InstitutionKind,
): FinancialQualification {
  // No Result: the kind is a closed enum, so there is nothing left to reject
  // once the type checks. Returning a Result here would be ceremony.
  return { role: RoleType.FINANCIAL, institutionKind };
}
