import type { AdministrativeAreaId } from './administrative-area-id.vo';
import type { AreaCode } from './area-code.vo';
import type { AreaName } from './area-name.vo';
import type { GeoPoint } from './geo-point.vo';
import type { AdministrativeLevel } from '../../country-profile/domain/administrative-level.vo';
import type { CountryCode } from '../../country-profile/domain/country-code.vo';

/**
 * What the AdministrativeArea aggregate announces.
 *
 * Naming: `<aggregate>.<past-tense verb>`.  Past tense because an event
 * reports something that has happened — a consumer cannot refuse it.
 */
export const AdministrativeAreaEventType = {
  REGISTERED: 'administrative-area.registered',
  RENAMED: 'administrative-area.renamed',
  ALIASES_CHANGED: 'administrative-area.aliases-changed',
  REPARENTED: 'administrative-area.reparented',
  CENTROID_SET: 'administrative-area.centroid-set',
  MERGED: 'administrative-area.merged',
  SPLIT: 'administrative-area.split',
  DISSOLVED: 'administrative-area.dissolved',
} as const;

export type AdministrativeAreaEventType =
  (typeof AdministrativeAreaEventType)[keyof typeof AdministrativeAreaEventType];

/** Every AdministrativeArea event names its aggregate the same way. */
export const ADMINISTRATIVE_AREA_AGGREGATE = 'AdministrativeArea';

// ---------------------------------------------------------------------------
// Payload interfaces — carry identifiers, not whole aggregates
// ---------------------------------------------------------------------------

export interface AdministrativeAreaRegisteredPayload {
  areaId: AdministrativeAreaId;
  countryCode: CountryCode;
  level: AdministrativeLevel;
  code: AreaCode;
  name: AreaName;
  parentId: AdministrativeAreaId | null;
  centroid: GeoPoint | null;
}

export interface AdministrativeAreaRenamedPayload {
  areaId: AdministrativeAreaId;
  countryCode: CountryCode;
  previousOfficialName: string;
  newOfficialName: string;
}

export interface AdministrativeAreaAliasesChangedPayload {
  areaId: AdministrativeAreaId;
  countryCode: CountryCode;
  previousAliases: readonly string[];
  newAliases: readonly string[];
}

export interface AdministrativeAreaReparentedPayload {
  areaId: AdministrativeAreaId;
  countryCode: CountryCode;
  previousParentId: AdministrativeAreaId | null;
  newParentId: AdministrativeAreaId | null;
}

export interface AdministrativeAreaCentroidSetPayload {
  areaId: AdministrativeAreaId;
  countryCode: CountryCode;
  centroid: GeoPoint;
}

export interface AdministrativeAreaMergedPayload {
  areaId: AdministrativeAreaId;
  countryCode: CountryCode;
  successorIds: readonly AdministrativeAreaId[];
}

export interface AdministrativeAreaSplitPayload {
  areaId: AdministrativeAreaId;
  countryCode: CountryCode;
  successorIds: readonly AdministrativeAreaId[];
}

export interface AdministrativeAreaDissolvedPayload {
  areaId: AdministrativeAreaId;
  countryCode: CountryCode;
}
