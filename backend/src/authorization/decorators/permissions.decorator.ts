import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions.enum';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Declares the permissions required to access a route, e.g.
 * @Permissions(Permission.MEMBER_INVITE). Read by PermissionsGuard.
 * Multiple permissions are combined with AND semantics.
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
