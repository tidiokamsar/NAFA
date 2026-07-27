import { SetMetadata } from '@nestjs/common';
import type { Role } from '../auth/auth.types';
import { ROLES_KEY } from './metadata.keys';

/**
 * Requires the caller to hold at least one of the listed roles.
 *
 * OR semantics — `@Roles('admin', 'auditor')` admits either. Enforced by
 * {@link RolesGuard}, which must be applied for the decorator to do anything.
 *
 * ```ts
 * @Roles('admin')
 * @Delete(':id')
 * remove(@Param('id') id: string) { ... }
 * ```
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
