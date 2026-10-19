import { ApiProperty } from '@nestjs/swagger';
import { OrganizationRole } from '../../organization-members/entities/organization-member.entity';
import { Permission } from '../../authorization/permissions.enum';

/**
 * The caller's standing inside one organization. `permissions` is the
 * exact list the server enforces for `role` (from the ratified
 * permission matrix), sorted alphabetically.
 */
export class MyMembershipResponseDto {
  @ApiProperty({ description: 'Organization UUID' })
  organizationId: string;

  @ApiProperty({ description: 'Membership (OrganizationMember) UUID' })
  memberId: string;

  @ApiProperty({ description: "The caller's user UUID" })
  userId: string;

  @ApiProperty({ enum: OrganizationRole })
  role: OrganizationRole;

  @ApiProperty({
    enum: Permission,
    isArray: true,
    description: 'Every permission the server grants this role',
  })
  permissions: Permission[];
}
