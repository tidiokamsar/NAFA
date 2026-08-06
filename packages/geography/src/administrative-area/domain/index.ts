// Value objects
export {
  type AdministrativeAreaId,
  administrativeAreaId,
} from './administrative-area-id.vo';
export { type AreaCode, areaCode } from './area-code.vo';
export { type AreaName, areaName } from './area-name.vo';
export { type GeoPoint, geoPoint } from './geo-point.vo';
export { type ValidityPeriod, validityPeriod } from './validity-period.vo';
export { AreaStatus, checkAreaTransition } from './area-status.vo';

// Events
export {
  AdministrativeAreaEventType,
  type AdministrativeAreaEventType as AdministrativeAreaEventTypeValue,
  ADMINISTRATIVE_AREA_AGGREGATE,
} from './administrative-area.events';
export type {
  AdministrativeAreaRegisteredPayload,
  AdministrativeAreaRenamedPayload,
  AdministrativeAreaAliasesChangedPayload,
  AdministrativeAreaReparentedPayload,
  AdministrativeAreaCentroidSetPayload,
  AdministrativeAreaMergedPayload,
  AdministrativeAreaSplitPayload,
  AdministrativeAreaDissolvedPayload,
} from './administrative-area.events';

// Aggregate
export {
  type RegisterAdministrativeAreaInput,
  type AdministrativeAreaSnapshot,
  type AdministrativeAreaDependencies,
  AdministrativeArea,
  validateParentChildLevels,
  validateLevelDeclaredInProfile,
} from './administrative-area.aggregate';
