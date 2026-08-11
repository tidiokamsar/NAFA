import { administrativeAreaId } from '@nafa/geography';
import { ActorRule } from '../actor.errors';
import { address } from './address.vo';

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

/** Unwraps a Result the test expects to have failed. */
function expectErr<T>(result: {
  ok: boolean;
  value?: T;
  error?: { rule: unknown; message: string };
}): { rule: unknown; message: string } {
  if (result.ok) {
    throw new Error(`expected err, got value`);
  }
  return result.error as { rule: unknown; message: string };
}

// ---------------------------------------------------------------------------
// GEO-001.7 — optional `areaId` on Address.
//
// Phase 1 only: the field exists, it is optional, it passes through. No
// automatic resolution, no data touched. These tests prove the contract:
// an actor without an `areaId` is still valid, and one with an `areaId`
// carries it through unchanged.
// ---------------------------------------------------------------------------

const AREA_ID = expectOk(
  administrativeAreaId('550e8400-e29b-41d4-a716-446655440000'),
);

describe('Address.areaId (GEO-001.7)', () => {
  it('accepts an address without areaId (backward compatible)', () => {
    const result = address({
      line: 'Quartier Manquepas',
      locality: 'Kindia',
      region: 'Kindia',
      countryCode: 'GN',
    });

    // areaId is undefined — the address is just as valid as before.
    expect(expectOk(result).areaId).toBeUndefined();
  });

  it('accepts an address with a resolved areaId', () => {
    const result = address({
      line: 'Quartier Manquepas',
      locality: 'Kindia',
      region: 'Kindia',
      countryCode: 'GN',
      areaId: AREA_ID,
    });

    expect(expectOk(result).areaId).toBe(AREA_ID);
  });

  it('passes areaId through without revalidation', () => {
    // The branded type was validated at construction in the geography master.
    // Foundation trusts the brand and does not duplicate the check.
    const result = address({
      line: '',
      locality: 'Conakry',
      region: 'Conakry',
      countryCode: 'GN',
      areaId: AREA_ID,
    });

    expect(expectOk(result).areaId).toBe(AREA_ID);
  });

  it('still rejects invalid addresses even with an areaId', () => {
    const result = address({
      line: '',
      locality: '', // invalid — locality required
      region: 'Kindia',
      countryCode: 'GN',
      areaId: AREA_ID,
    });

    expect(expectErr(result).rule).toBe(ActorRule.INVALID_ADDRESS);
  });
});
