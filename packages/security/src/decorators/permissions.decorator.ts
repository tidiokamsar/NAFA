import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../auth/auth.types';
import { PERMISSIONS_KEY } from './metadata.keys';

/**
 * Requires **all** the listed permissions.
 *
 * AND semantics, unlike {@link Roles}: a route that both reads and writes
 * should demand both rights, and the stricter default is the safer one.
 * Wildcards on the granted side still apply — `shipment:*` satisfies
 * `shipment:read`.
 *
 * ```ts
 * @Permissions('shipment:read', 'shipment:update')
 * @Patch(':id')
 * update() { ... }
 * ```
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
