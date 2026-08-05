import type { AuthenticatedUser } from '../auth/auth.types';
import { RbacService } from './rbac.service';

function user(
  roles: string[] = [],
  permissions: string[] = [],
): AuthenticatedUser {
  return { id: 'u1', roles, permissions };
}

describe('RbacService', () => {
  const rbac = new RbacService();

  describe('roles', () => {
    it('admits a user holding any of the required roles', () => {
      expect(rbac.hasAnyRole(user(['auditor']), ['admin', 'auditor'])).toBe(
        true,
      );
    });

    it('rejects a user holding none of them', () => {
      expect(rbac.hasAnyRole(user(['viewer']), ['admin', 'auditor'])).toBe(
        false,
      );
    });

    it('requires every role for hasAllRoles', () => {
      expect(rbac.hasAllRoles(user(['admin']), ['admin', 'auditor'])).toBe(
        false,
      );
      expect(
        rbac.hasAllRoles(user(['admin', 'auditor']), ['admin', 'auditor']),
      ).toBe(true);
    });

    it('treats an empty requirement as satisfied', () => {
      expect(rbac.hasAnyRole(user(), [])).toBe(true);
      expect(rbac.hasAllRoles(user(), [])).toBe(true);
    });
  });

  describe('permission matching', () => {
    it('matches an exact permission', () => {
      expect(RbacService.matches('shipment:read', 'shipment:read')).toBe(true);
    });

    it('matches a wildcard action', () => {
      expect(RbacService.matches('shipment:*', 'shipment:delete')).toBe(true);
    });

    it('matches a full wildcard', () => {
      expect(RbacService.matches('*:*', 'anything:at-all')).toBe(true);
    });

    it('matches a wildcard resource', () => {
      expect(RbacService.matches('*:read', 'shipment:read')).toBe(true);
      expect(RbacService.matches('*:read', 'shipment:delete')).toBe(false);
    });

    it('does not match a different action', () => {
      expect(RbacService.matches('shipment:read', 'shipment:delete')).toBe(
        false,
      );
    });

    // Guards against a substring-based implementation, where `shipment:read`
    // would wrongly satisfy `shipment:read-all`.
    it('compares whole segments, not prefixes', () => {
      expect(RbacService.matches('shipment:read', 'shipment:read-all')).toBe(
        false,
      );
    });

    it('does not let a shorter permission grant a deeper one', () => {
      expect(RbacService.matches('shipment', 'shipment:delete')).toBe(false);
    });

    it('lets a trailing wildcard cover deeper segments', () => {
      expect(RbacService.matches('shipment:*', 'shipment:read:own')).toBe(true);
    });

    it('does not let a deeper grant satisfy a shallower requirement', () => {
      expect(RbacService.matches('shipment:read:own', 'shipment:read')).toBe(
        false,
      );
    });
  });

  describe('permission checks', () => {
    it('accepts when a wildcard grant covers the requirement', () => {
      expect(
        rbac.hasPermission(user([], ['shipment:*']), 'shipment:update'),
      ).toBe(true);
    });

    it('requires all permissions for hasAllPermissions', () => {
      const subject = user([], ['shipment:read']);
      expect(
        rbac.hasAllPermissions(subject, ['shipment:read', 'shipment:update']),
      ).toBe(false);
    });

    it('requires only one for hasAnyPermission', () => {
      const subject = user([], ['shipment:read']);
      expect(
        rbac.hasAnyPermission(subject, ['shipment:read', 'shipment:update']),
      ).toBe(true);
    });
  });
});
