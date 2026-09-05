import type { ActorId } from '@nafa/foundation';

/**
 * The Actor Master, as the trade domain sees it.
 *
 * Cross-Master by design (ADR-0011 §3): trade imports ActorId but never
 * the Actor aggregate — whether a seller exists and may trade is a
 * question about the actors collection, asked through this port.
 */
export interface SellerRegistry {
  /**
   * Whether the actor exists and is active — invariant 2's answer. The v1
   * contract is a boolean: the day offers need more (kyc level, roles,
   * suspension reasons), the port grows a richer return type and its
   * adapters follow.
   */
  isActive(sellerId: ActorId): Promise<boolean>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const SELLER_REGISTRY = Symbol('SELLER_REGISTRY');
