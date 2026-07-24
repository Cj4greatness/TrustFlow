import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';

@Injectable()
export class OrganizationsRepository {
  constructor(
    @InjectRepository(Organization)
    private readonly repository: Repository<Organization>,
  ) {}

  create(data: Partial<Organization>): Organization {
    return this.repository.create(data);
  }

  save(organization: Organization): Promise<Organization> {
    return this.repository.save(organization);
  }

  findById(id: string): Promise<Organization | null> {
    return this.repository.findOne({ where: { id } });
  }

  existsBySlug(slug: string): Promise<boolean> {
    return this.repository.exists({ where: { slug } });
  }

  /**
   * Same operations as above, but bound to a transactional
   * EntityManager rather than this repository's own connection.
   * Used by OrganizationsService.createWithOwner() so organization
   * creation and owner-membership creation commit or roll back
   * together as a single atomic unit (CTO Rule 4).
   */
  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(Organization);
    return {
      create: (data: Partial<Organization>) => transactionalRepo.create(data),
      save: (organization: Organization) =>
        transactionalRepo.save(organization),
      existsBySlug: (slug: string) =>
        transactionalRepo.exists({ where: { slug } }),
    };
  }
}
