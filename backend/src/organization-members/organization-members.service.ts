import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrganizationMembersRepository } from './organization-members.repository';
import { OrganizationRole } from './entities/organization-member.entity';
import { MemberResponseDto } from './dto/member-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserStatus } from '../users/entities/user.entity';
import { AuditLogService } from '../audit/audit-log.service';

@Injectable()
export class OrganizationMembersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly organizationMembersRepository: OrganizationMembersRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listMembers(organizationId: string): Promise<MemberResponseDto[]> {
    const members =
      await this.organizationMembersRepository.findByOrganization(
        organizationId,
      );

    return members.map(
      (member) =>
        new MemberResponseDto({
          id: member.id,
          role: member.role,
          joinedAt: member.joinedAt,
          user: new UserResponseDto({
            id: member.user.id,
            firstName: member.user.firstName,
            lastName: member.user.lastName,
            email: member.user.email,
            phone: member.user.phone,
            avatar: member.user.avatar,
            status: member.user.status,
            emailVerified: member.user.emailVerified,
            lastLogin: member.user.lastLogin,
            createdAt: member.user.createdAt,
          }),
        }),
    );
  }

  async removeMember(
    organizationId: string,
    memberIdToRemove: string,
    actorUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const memberRepo =
        this.organizationMembersRepository.withTransaction(manager);
      await memberRepo.lockOrganization(organizationId);

      const target = await memberRepo.findById(memberIdToRemove);
      if (!target || target.organizationId !== organizationId) {
        throw new NotFoundException('Member not found in this organization');
      }

      const actor = await memberRepo.findByOrganizationAndUser(
        organizationId,
        actorUserId,
      );
      const activeOwners = await memberRepo.findActiveOwners(organizationId);
      if (target.role === OrganizationRole.OWNER) {
        if (
          activeOwners.length <= 1 &&
          actor?.role === OrganizationRole.OWNER
        ) {
          throw new BadRequestException({
            message:
              'The organization owner cannot be removed directly — transfer ownership first',
            code: 'LAST_OWNER_CANNOT_BE_REMOVED',
          });
        }

        if (
          activeOwners.length <= 1 ||
          actor?.role !== OrganizationRole.OWNER
        ) {
          throw new BadRequestException(
            'The organization owner cannot be removed directly — transfer ownership first',
          );
        }
      }

      if (
        target.role === OrganizationRole.ADMIN &&
        actor?.role !== OrganizationRole.OWNER
      ) {
        throw new ForbiddenException({
          message: 'Only the organization owner may remove an Admin',
          code: 'ADMIN_CANNOT_MODIFY_ADMIN',
        });
      }

      await memberRepo.removeMember(memberIdToRemove);
    });
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: OrganizationRole,
    actorUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const memberRepo =
        this.organizationMembersRepository.withTransaction(manager);
      await memberRepo.lockOrganization(organizationId);

      const target = await memberRepo.findById(memberId);
      if (!target || target.organizationId !== organizationId) {
        throw new NotFoundException('Member not found in this organization');
      }

      const actor = await memberRepo.findByOrganizationAndUser(
        organizationId,
        actorUserId,
      );

      if (
        !actor ||
        (actor.role !== OrganizationRole.OWNER &&
          actor.role !== OrganizationRole.ADMIN)
      ) {
        throw new ForbiddenException(
          'Your role does not have permission to change member roles',
        );
      }

      if (
        target.role === OrganizationRole.OWNER ||
        newRole === OrganizationRole.OWNER
      ) {
        throw new BadRequestException(
          'Use the ownership transfer action to change the Owner role',
        );
      }

      if (
        newRole === OrganizationRole.ADMIN &&
        actor.role !== OrganizationRole.OWNER
      ) {
        throw new ForbiddenException({
          message: 'Only the organization owner may promote a member to Admin',
          code: 'ADMIN_PROMOTION_OWNER_ONLY',
        });
      }

      const isAdminSelfDemotion =
        actor.id === target.id &&
        actor.role === OrganizationRole.ADMIN &&
        target.role === OrganizationRole.ADMIN &&
        (newRole === OrganizationRole.MANAGER ||
          newRole === OrganizationRole.STAFF ||
          newRole === OrganizationRole.VIEWER);

      if (
        target.role === OrganizationRole.ADMIN &&
        actor.role !== OrganizationRole.OWNER &&
        !isAdminSelfDemotion
      ) {
        throw new ForbiddenException({
          message: "Only the organization owner may change an Admin's role",
          code: 'ADMIN_CANNOT_MODIFY_ADMIN',
        });
      }

      if (target.role !== newRole) {
        await memberRepo.update(memberId, { role: newRole });
        await this.auditLogService.recordRoleChange(manager, {
          actorUserId,
          targetUserId: target.userId,
          targetMemberId: target.id,
          organizationId,
          previousRole: target.role,
          newRole,
          operation: 'update_role',
        });
      }
    });
  }

  async transferOwnership(
    organizationId: string,
    newOwnerMemberId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const memberRepo =
        this.organizationMembersRepository.withTransaction(manager);

      await memberRepo.lockOrganization(organizationId);
      const currentOwners = await memberRepo.findActiveOwners(organizationId);
      const currentOwner = currentOwners[0];
      if (!currentOwner) {
        throw new NotFoundException('This organization has no current owner');
      }
      if (currentOwners.length > 1) {
        throw new ConflictException({
          message:
            'This organization has multiple active Owners and needs separately authorized remediation',
          code: 'OWNERSHIP_STATE_INCONSISTENT',
        });
      }

      const newOwner = await memberRepo.findById(newOwnerMemberId);
      if (!newOwner || newOwner.organizationId !== organizationId) {
        throw new NotFoundException(
          'Target member not found in this organization',
        );
      }

      if (newOwner.id === currentOwner.id && currentOwners.length === 1) {
        throw new BadRequestException('This member is already the owner');
      }

      if (newOwner.user?.status !== UserStatus.ACTIVE) {
        throw new BadRequestException({
          message: 'Ownership cannot be transferred to an inactive member',
          code: 'OWNERSHIP_TARGET_INACTIVE',
        });
      }

      await memberRepo.update(currentOwner.id, {
        role: OrganizationRole.ADMIN,
      });
      await memberRepo.update(newOwner.id, { role: OrganizationRole.OWNER });
      await this.auditLogService.recordRoleChange(manager, {
        actorUserId,
        targetUserId: currentOwner.userId,
        targetMemberId: currentOwner.id,
        organizationId,
        previousRole: OrganizationRole.OWNER,
        newRole: OrganizationRole.ADMIN,
        operation: 'transfer_ownership',
      });
      await this.auditLogService.recordRoleChange(manager, {
        actorUserId,
        targetUserId: newOwner.userId,
        targetMemberId: newOwner.id,
        organizationId,
        previousRole: newOwner.role,
        newRole: OrganizationRole.OWNER,
        operation: 'transfer_ownership',
      });
    });
  }

  async leaveOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const memberRepo =
        this.organizationMembersRepository.withTransaction(manager);
      await memberRepo.lockOrganization(organizationId);

      const membership = await memberRepo.findByOrganizationAndUser(
        organizationId,
        userId,
      );
      if (!membership) {
        throw new NotFoundException(
          'You are not a member of this organization',
        );
      }

      const activeOwners = await memberRepo.findActiveOwners(organizationId);
      if (membership.role === OrganizationRole.OWNER) {
        if (activeOwners.length <= 1) {
          throw new BadRequestException({
            message: 'Transfer ownership before leaving the organization',
            code: 'LAST_OWNER_CANNOT_BE_REMOVED',
          });
        }
      }

      await memberRepo.removeMember(membership.id);
    });
  }
}
