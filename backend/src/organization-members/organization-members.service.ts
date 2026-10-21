import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrganizationMembersRepository } from './organization-members.repository';
import { OrganizationRole } from './entities/organization-member.entity';
import { MemberResponseDto } from './dto/member-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';

@Injectable()
export class OrganizationMembersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly organizationMembersRepository: OrganizationMembersRepository,
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
  ): Promise<void> {
    const target =
      await this.organizationMembersRepository.findById(memberIdToRemove);
    if (!target || target.organizationId !== organizationId) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (target.role === OrganizationRole.OWNER) {
      throw new BadRequestException(
        'The organization owner cannot be removed directly — transfer ownership first',
      );
    }

    await this.organizationMembersRepository.removeMember(memberIdToRemove);
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: OrganizationRole,
  ): Promise<void> {
    const target = await this.organizationMembersRepository.findById(memberId);
    if (!target || target.organizationId !== organizationId) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (
      target.role === OrganizationRole.OWNER ||
      newRole === OrganizationRole.OWNER
    ) {
      throw new BadRequestException(
        'Use the ownership transfer action to change the Owner role',
      );
    }

    await this.organizationMembersRepository.updateRole(memberId, newRole);
  }

  async transferOwnership(
    organizationId: string,
    newOwnerMemberId: string,
  ): Promise<void> {
    const currentOwner =
      await this.organizationMembersRepository.findOwner(organizationId);
    if (!currentOwner) {
      throw new NotFoundException('This organization has no current owner');
    }

    const newOwner =
      await this.organizationMembersRepository.findById(newOwnerMemberId);
    if (!newOwner || newOwner.organizationId !== organizationId) {
      throw new NotFoundException(
        'Target member not found in this organization',
      );
    }

    if (newOwner.id === currentOwner.id) {
      throw new BadRequestException('This member is already the owner');
    }

    await this.dataSource.transaction(async (manager) => {
      const memberRepo =
        this.organizationMembersRepository.withTransaction(manager);
      await memberRepo.update(currentOwner.id, {
        role: OrganizationRole.ADMIN,
      });
      await memberRepo.update(newOwner.id, { role: OrganizationRole.OWNER });
    });
  }

  async leaveOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership =
      await this.organizationMembersRepository.findByOrganizationAndUser(
        organizationId,
        userId,
      );
    if (!membership) {
      throw new NotFoundException('You are not a member of this organization');
    }

    if (membership.role === OrganizationRole.OWNER) {
      throw new BadRequestException(
        'Transfer ownership before leaving the organization',
      );
    }

    await this.organizationMembersRepository.removeMember(membership.id);
  }
}
