import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser, Permission, Role } from '../auth/auth.types';

/**
 * Role- and permission-based access control.
 *
 * Permissions are `resource:action` strings and `*` matches a whole segment,
 * so `shipment:*` covers every action on shipments and `*:*` covers
 * everything. Matching is segment-wise rather than a substring test, which
 * prevents `shipment:read` from accidentally satisfying `shipment:read-all`.
 *
 * Holds no role catalogue: the roles a user has arrive on the token, and what
 * they mean is the issuing service's business. This is what keeps the package
 * usable by services that model roles very differently.
 */
@Injectable()
export class RbacService {
  /** True when the user holds at least one of `required` (OR semantics). */
  hasAnyRole(user: AuthenticatedUser, required: readonly Role[]): boolean {
    if (required.length === 0) return true;
    return required.some((role) => user.roles.includes(role));
  }

  /** True when the user holds every one of `required` (AND semantics). */
  hasAllRoles(user: AuthenticatedUser, required: readonly Role[]): boolean {
    if (required.length === 0) return true;
    return required.every((role) => user.roles.includes(role));
  }

  /** True when at least one granted permission matches `required`. */
  hasPermission(user: AuthenticatedUser, required: Permission): boolean {
    return user.permissions.some((granted) =>
      RbacService.matches(granted, required),
    );
  }

  hasAnyPermission(
    user: AuthenticatedUser,
    required: readonly Permission[],
  ): boolean {
    if (required.length === 0) return true;
    return required.some((permission) => this.hasPermission(user, permission));
  }

  hasAllPermissions(
    user: AuthenticatedUser,
    required: readonly Permission[],
  ): boolean {
    if (required.length === 0) return true;
    return required.every((permission) => this.hasPermission(user, permission));
  }

  /**
   * Segment-wise wildcard match of a granted permission against a required one.
   *
   * A granted permission with fewer segments never matches a longer required
   * one unless it ends in `*`, so `shipment` does not grant `shipment:delete`.
   */
  static matches(granted: Permission, required: Permission): boolean {
    if (granted === required) return true;

    const grantedParts = granted.split(':');
    const requiredParts = required.split(':');

    if (grantedParts.length !== requiredParts.length) {
      // A trailing `*` is the only way to cover deeper segments.
      const last = grantedParts[grantedParts.length - 1];
      if (last !== '*' || grantedParts.length > requiredParts.length) {
        return false;
      }
      return grantedParts
        .slice(0, -1)
        .every((part, i) => part === '*' || part === requiredParts[i]);
    }

    return grantedParts.every(
      (part, i) => part === '*' || part === requiredParts[i],
    );
  }
}
