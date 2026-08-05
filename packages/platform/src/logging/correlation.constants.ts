/**
 * Re-exported from `@nafa/shared`, which is now the single home for constants
 * shared across packages (AR-0003).
 *
 * Kept as a re-export so existing imports from `@nafa/platform` keep working;
 * new code should import from `@nafa/shared` directly.
 *
 * @deprecated Import from `@nafa/shared`.
 */
export { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '@nafa/shared';
