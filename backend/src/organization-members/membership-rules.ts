import { OrganizationRole } from './entities/organization-member.entity';

/**
 * Membership actions that require a permission check. Centralized
 * here (rather than scattered across services/controllers) so that
 * when the full RBAC module arrives, this table becomes the seed
 * data for the real permission system rather than logic that has to
 * be hunted down and migrated from multiple call sites.
 */
export enum MembershipAction {
  INVITE_MEMBER = 'invite_member',
  REMOVE_MEMBER = 'remove_member',
  PROMOTE_MEMBER = 'promote_member',
  DEMOTE_MEMBER = 'demote_member',
  TRANSFER_OWNERSHIP = 'transfer_ownership',
  UPDATE_ORGANIZATION = 'update_organization',
  DELETE_ORGANIZATION = 'delete_organization',
}

/**
 * The minimum role required to perform each action. A role can
 * perform an action if its rank is >= the required rank (see
 * ROLE_RANK below) — Owner can do everything Admin can, Admin can do
 * everything Manager can, and so on.
 */
const ACTION_MINIMUM_ROLE: Record<MembershipAction, OrganizationRole> = {
  [MembershipAction.INVITE_MEMBER]: OrganizationRole.ADMIN,
  [MembershipAction.REMOVE_MEMBER]: OrganizationRole.ADMIN,
  [MembershipAction.PROMOTE_MEMBER]: OrganizationRole.ADMIN,
  [MembershipAction.DEMOTE_MEMBER]: OrganizationRole.ADMIN,
  [MembershipAction.TRANSFER_OWNERSHIP]: OrganizationRole.OWNER,
  [MembershipAction.UPDATE_ORGANIZATION]: OrganizationRole.ADMIN,
  [MembershipAction.DELETE_ORGANIZATION]: OrganizationRole.OWNER,
};

const ROLE_RANK: Record<OrganizationRole, number> = {
  [OrganizationRole.STAFF]: 0,
  [OrganizationRole.MANAGER]: 1,
  [OrganizationRole.ADMIN]: 2,
  [OrganizationRole.OWNER]: 3,
};

/**
 * The single function every service should call to check membership
 * permissions, rather than hand-rolling role comparisons inline.
 * This is a lightweight precursor to the full RBAC module (Module 6)
 * — once that exists, this function's implementation can be swapped
 * to consult the real permission system without changing any of its
 * call sites.
 */
export function canPerformMembershipAction(
  actorRole: OrganizationRole,
  action: MembershipAction,
): boolean {
  const requiredRole = ACTION_MINIMUM_ROLE[action];
  return ROLE_RANK[actorRole] >= ROLE_RANK[requiredRole];
}
