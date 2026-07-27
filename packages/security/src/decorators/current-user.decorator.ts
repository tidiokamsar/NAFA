import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Injects the authenticated caller, or one of its fields.
 *
 * ```ts
 * findMine(@CurrentUser() user: AuthenticatedUser) { ... }
 * findMine(@CurrentUser('id') userId: string) { ... }
 * ```
 *
 * Returns `undefined` on a `@Public()` route, since nothing authenticated the
 * request — type the parameter accordingly rather than assuming a user.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
