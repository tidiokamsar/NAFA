import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RbacService } from '../rbac/rbac.service';
import { PermissionsGuard } from './permissions.guard';

function contextFor(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        method: 'GET',
        url: '/shipments',
        route: { path: '/shipments' },
      }),
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardRequiring(
  permissions: string[] | undefined,
  isPublic = false,
): PermissionsGuard {
  const reflector = {
    getAllAndOverride: jest.fn((key: unknown) =>
      typeof key === 'symbol' && key.toString().includes('public')
        ? isPublic
        : permissions,
    ),
  } as unknown as Reflector;

  return new PermissionsGuard(reflector, new RbacService());
}

describe('PermissionsGuard', () => {
  const user: AuthenticatedUser = {
    id: 'u1',
    roles: [],
    permissions: ['shipment:read'],
  };

  it('allows a route with no permission requirement', async () => {
    await expect(
      guardRequiring(undefined).canActivate(contextFor(user)),
    ).resolves.toBe(true);
  });

  it('allows a public route without inspecting the user', async () => {
    await expect(
      guardRequiring(['shipment:read'], true).canActivate(contextFor()),
    ).resolves.toBe(true);
  });

  it('allows a user holding the permission', async () => {
    await expect(
      guardRequiring(['shipment:read']).canActivate(contextFor(user)),
    ).resolves.toBe(true);
  });

  it('rejects a user missing the permission', async () => {
    await expect(
      guardRequiring(['shipment:delete']).canActivate(contextFor(user)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // @Permissions is AND: holding one of two is not enough.
  it('rejects when only some of the required permissions are held', async () => {
    await expect(
      guardRequiring(['shipment:read', 'shipment:update']).canActivate(
        contextFor(user),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a wildcard grant', async () => {
    const wildcard: AuthenticatedUser = {
      id: 'u2',
      roles: [],
      permissions: ['shipment:*'],
    };
    await expect(
      guardRequiring(['shipment:read', 'shipment:update']).canActivate(
        contextFor(wildcard),
      ),
    ).resolves.toBe(true);
  });

  it('rejects an unauthenticated request on a protected route', async () => {
    await expect(
      guardRequiring(['shipment:read']).canActivate(contextFor(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not disclose which permission was missing', async () => {
    await expect(
      guardRequiring(['shipment:delete']).canActivate(contextFor(user)),
    ).rejects.toThrow('Insufficient permissions');
  });
});
