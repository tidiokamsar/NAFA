/**
 * Pagination defaults, identical across every NAFA API so clients can rely on
 * one behaviour.
 */

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Hard ceiling on `pageSize`. A request asking for more is clamped rather than
 * rejected — an unbounded page is how one client accidentally takes a service
 * down.
 */
export const MAX_PAGE_SIZE = 100;

export const DEFAULT_PAGE = 1;

/** Clamps a requested page size into the allowed range. */
export function clampPageSize(requested?: number): number {
  if (!requested || !Number.isFinite(requested) || requested < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(requested), MAX_PAGE_SIZE);
}
