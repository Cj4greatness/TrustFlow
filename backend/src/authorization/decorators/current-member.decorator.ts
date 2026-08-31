import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { OrganizationMember } from '../../organization-members/entities/organization-member.entity';

interface RequestWithMember extends Request {
  currentMember?: OrganizationMember;
}

/**
 * Injects the acting user's OrganizationMember row for the
 * organization the current request targets — populated by
 * PermissionsGuard before the route handler runs, so controllers
 * never need to look it up themselves.
 */
export const CurrentMember = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): OrganizationMember | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithMember>();
    return request.currentMember;
  },
);
