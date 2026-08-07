import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

interface RequestWithOrgId extends Request {
  currentOrganizationId?: string;
}

/**
 * Injects the organization ID the current request targets — read
 * from the :id route param by PermissionsGuard and attached to the
 * request, so controllers have one consistent way to access it
 * regardless of the route's exact param name.
 */
export const CurrentOrganization = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithOrgId>();
    return request.currentOrganizationId;
  },
);
