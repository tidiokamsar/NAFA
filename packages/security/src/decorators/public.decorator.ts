import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './metadata.keys';

/**
 * Marks a route as reachable without authentication.
 *
 * Authentication is expected to be on by default (a global `JwtAuthGuard`), so
 * forgetting a decorator leaves a route protected rather than open. This is
 * the one escape hatch, and it should be rare enough to notice in review.
 *
 * ```ts
 * @Public()
 * @Get('status')
 * status() { ... }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
