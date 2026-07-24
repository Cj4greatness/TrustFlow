import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OrganizationMember } from './entities/organization-member.entity';

@Injectable()
export class OrganizationMembersRepository {
  constructor(
    @InjectRepository(OrganizationMember)
    private readonly repository: Repository<OrganizationMember>,
  ) {}

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

  /**
   * Same reasoning as OrganizationsRepository.withTransaction — used
   * so the owner-membership row is created inside the same
   * transaction as the organization itself.
   */
  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(OrganizationMember);
    return {
      create: (data: Partial<OrganizationMember>) =>
        transactionalRepo.create(data),
      save: (member: OrganizationMember) => transactionalRepo.save(member),
    };
  }
}
