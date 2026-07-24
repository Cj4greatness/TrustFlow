import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationMembersRepository } from '../organization-members/organization-members.repository';
import { SlugService } from '../common/services/slug.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { Organization } from './entities/organization.entity';
import { OrganizationRole } from '../organization-members/entities/organization-member.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly organizationMembersRepository: OrganizationMembersRepository,
    private readonly slugService: SlugService,
  ) {}

  /**
   * Creates an organization and its owner membership atomically
   * (CTO Rule 4): if membership creation fails for any reason, the
   * organization is rolled back too — there is never a moment where
   * an organization exists with zero owners.
   *
   * The creating user automatically becomes Owner (CTO Rule 3), no
   * exceptions, no separate "assign owner" step.
   */
  async createWithOwner(
    dto: CreateOrganizationDto,
    creatorUserId: string,
  ): Promise<OrganizationResponseDto> {
    const organization = await this.dataSource.transaction(async (manager) => {
      const orgRepo = this.organizationsRepository.withTransaction(manager);
      const memberRepo =
        this.organizationMembersRepository.withTransaction(manager);

      const slug = await this.slugService.ensureUniqueSlug(
        dto.name,
        (candidate) => orgRepo.existsBySlug(candidate),
      );

      const newOrganization = orgRepo.create({
        name: dto.name,
        slug,
        industry: dto.industry ?? null,
        country: dto.country ?? null,
        timezone: dto.timezone ?? null,
        currency: dto.currency ?? 'NGN',
      });
      const savedOrganization = await orgRepo.save(newOrganization);

      const ownerMembership = memberRepo.create({
        organizationId: savedOrganization.id,
        userId: creatorUserId,
        role: OrganizationRole.OWNER,
        joinedAt: new Date(),
        invitedBy: null,
      });
      await memberRepo.save(ownerMembership);

      return savedOrganization;
    });

    return this.toResponseDto(organization);
  }

  async findById(id: string): Promise<OrganizationResponseDto> {
    const organization = await this.organizationsRepository.findById(id);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return this.toResponseDto(organization);
  }

  /**
   * Returns the organizations the given user belongs to (owns or is
   * a member of), for the GET /organizations/me endpoint. A user may
   * belong to multiple organizations, so this returns an array even
   * though today most users will have exactly one.
   */
  async findMine(userId: string): Promise<OrganizationResponseDto[]> {
    const memberships =
      await this.organizationMembersRepository.findOwnedByUser(userId);
    return memberships.map((membership) =>
      this.toResponseDto(membership.organization),
    );
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    const existing = await this.organizationsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    const updated = this.organizationsRepository.create({
      ...existing,
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.industry !== undefined && { industry: dto.industry }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      ...(dto.logo !== undefined && { logo: dto.logo }),
    });

    const saved = await this.organizationsRepository.save(updated);
    return this.toResponseDto(saved);
  }

  private toResponseDto(organization: Organization): OrganizationResponseDto {
    return new OrganizationResponseDto({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      industry: organization.industry,
      country: organization.country,
      timezone: organization.timezone,
      currency: organization.currency,
      logo: organization.logo,
      subscriptionPlan: organization.subscriptionPlan,
      status: organization.status,
      createdAt: organization.createdAt,
    });
  }
}
