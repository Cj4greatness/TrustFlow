import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthorizationService } from '../authorization.service';
import { OrganizationMembersRepository } from '../../organization-members/organization-members.repository';
import { Permission } from '../permissions.enum';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload.type';
import type { OrganizationMember } from '../../organization-members/entities/organization-member.entity';

interface RequestWithAuthContext extends Request {
  user?: AuthenticatedUser;
  currentMember?: OrganizationMember;
  currentOrganizationId?: string;
  params: { id?: string };
}

/**
 * Resolves the full authorization chain for any route decorated with
 * @Permissions(): confirms the caller is a member of the target
 * organization, checks their role against the required permissions
 * via AuthorizationService, and — on success — attaches
 * currentMember/currentOrganizationId to the request so
 * @CurrentMember()/@CurrentOrganization() can inject them without a
 * second lookup.
 *
 * Assumes the route has an :id param identifying the organization
 * (matching the existing controller convention, e.g.
 * /organizations/:id/members/...). Routes without @Permissions()
 * metadata are allowed through unchanged — this guard only acts when
 * a route explicitly opts in.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly organizationMembersRepository: OrganizationMembersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuthContext>();
    const user = request.user;
    const organizationId = request.params.id;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!organizationId) {
      throw new ForbiddenException(
        'This route requires an organization context but none was found',
      );
    }

    const membership =
      await this.organizationMembersRepository.findByOrganizationAndUser(
        organizationId,
        user.id,
      );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const hasAllPermissions = this.authorizationService.canAll(
      membership.role,
      requiredPermissions,
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Your role (${membership.role}) does not have permission to perform this action`,
      );
    }

    request.currentMember = membership;
    request.currentOrganizationId = organizationId;

    return true;
  }
}
