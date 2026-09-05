import type { ActorId } from '@nafa/foundation';
import type { AdministrativeAreaId } from '@nafa/geography';
import type { ProductId } from '@nafa/products';
import type { Offer } from '../offer.aggregate';
import type { OfferId } from '../offer-id.vo';

/**
 * How the domain reaches offers.
 *
 * An interface plus a token. Whether the rows live in Postgres, in memory
 * or behind a service call is an adapter decision; naming any of them
 * here would make the port abstract nothing.
 */
export interface OfferRepository {
  findById(id: OfferId): Promise<Offer | null>;

  /** Every offer of one seller, terminated ones included. */
  findBySeller(sellerId: ActorId): Promise<readonly Offer[]>;

  /** Every offer on one product, terminated ones included. */
  findByProduct(productId: ProductId): Promise<readonly Offer[]>;

  /** Every offer picking up in one area. */
  findByPickupArea(areaId: AdministrativeAreaId): Promise<readonly Offer[]>;

  /**
   * Persists the offer, refusing the write if the stored row moved.
   *
   * Same contract as every repository before it: callers pass
   * `offer.expectedVersion` — the version it was loaded at — an adapter
   * compares it in its WHERE clause and raises `StaleVersionError` when no
   * row matches. Zero means the offer has never been stored, so the write
   * is an insert.
   */
  save(offer: Offer, expectedVersion: number): Promise<void>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const OFFER_REPOSITORY = Symbol('OFFER_REPOSITORY');
