import { Injectable } from '@nestjs/common';
import { OrganizationRole } from '../organization-members/entities/organization-member.entity';
import { Permission } from './permissions.enum';
import { PERMISSION_MATRIX } from './permission-matrix';

/**
 * The single source of truth for "can this role do this thing."
 * Guards and services call this rather than comparing roles inline —
 * per CTO directive, "Controllers should never manually compare
 * roles."
 */
@Injectable()
export class AuthorizationService {
  can(role: OrganizationRole, permission: Permission): boolean {
    return PERMISSION_MATRIX[role].includes(permission);
  }

  /**
   * The full, ratified permission list for a role, in a stable
   * (alphabetical) order. Exposed so the frontend can render
   * role-aware UI from the SAME matrix the guards enforce, instead of
   * inferring capabilities from role names. The server remains the
   * authority: hiding a button is a UX nicety, never the security
   * boundary.
   */
  permissionsFor(role: OrganizationRole): Permission[] {
    return [...PERMISSION_MATRIX[role]].sort();
  }

  /**
   * Convenience method for checking multiple permissions at once —
   * true only if the role holds every listed permission. Not yet
   * used by any guard, but anticipates decorators that declare more
   * than one required permission on a single route.
   */
  canAll(role: OrganizationRole, permissions: Permission[]): boolean {
    return permissions.every((permission) => this.can(role, permission));
  }
}
