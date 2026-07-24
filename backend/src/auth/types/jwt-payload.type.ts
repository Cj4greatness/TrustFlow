/**
 * Shape of the payload embedded in every TrustFlow access token.
 * `sub` follows JWT convention for subject (the user id).
 *
 * Deliberately does NOT include organizationId or role — unlike a
 * single-tenant system, a TrustFlow user can belong to multiple
 * organizations (per OrganizationMember), so "current organization"
 * is a per-request concern resolved separately, not baked into the
 * token itself. This keeps a token valid across organization
 * switches rather than needing reissue every time.
 */
export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}
