import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  OrganizationMember,
  OrganizationRole,
} from './entities/organization-member.entity';

@Injectable()
export class OrganizationMembersRepository {
  constructor(
    @InjectRepository(OrganizationMember)
    private readonly repository: Repository<OrganizationMember>,
  ) {}

  findById(id: string): Promise<OrganizationMember | null> {
    return this.repository.findOne({ where: { id } });
  }

  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null> {
    return this.repository.findOne({ where: { organizationId, userId } });
  }

  findOwnedByUser(userId: string): Promise<OrganizationMember[]> {
    return this.repository.find({
      where: { userId },
      relations: { organization: true },
    });
  }

  findByOrganization(organizationId: string): Promise<OrganizationMember[]> {
    return this.repository.find({
      where: { organizationId },
      relations: { user: true },
      order: { joinedAt: 'ASC' },
    });
  }

  /**
   * Returns the current Owner of an organization. Per CTO Rule 5,
   * every organization has exactly one Owner at a time (ownership
   * transfer changes who holds it, never leaves it empty) — so this
   * can safely assume at most one result rather than returning an
   * array.
   */
  findOwner(organizationId: string): Promise<OrganizationMember | null> {
    return this.repository.findOne({
      where: { organizationId, role: OrganizationRole.OWNER },
    });
  }

  async updateRole(id: string, role: OrganizationRole): Promise<void> {
    await this.repository.update({ id }, { role });
  }

  /**
   * Hard-deletes the membership row (not a soft delete) — unlike
   * User or Organization, a removed membership genuinely no longer
   * exists as a relationship; there's nothing to preserve by keeping
   * a "deleted" row around. The historical fact that someone was
   * once a member belongs in AuditLog, not in a soft-deleted
   * OrganizationMember row.
   */
  async removeMember(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  /**
   * Same reasoning as OrganizationsRepository.withTransaction — used
   * so the owner-membership row is created inside the same
   * transaction as the organization itself, and for atomic ownership
   * transfers (demote old owner + promote new owner together).
   */
  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(OrganizationMember);
    return {
      create: (data: Partial<OrganizationMember>) =>
        transactionalRepo.create(data),
      save: (member: OrganizationMember) => transactionalRepo.save(member),
      update: (id: string, data: Partial<OrganizationMember>) =>
        transactionalRepo.update({ id }, data),
    };
  }
}
