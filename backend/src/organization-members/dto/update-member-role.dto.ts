import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrganizationRole } from '../entities/organization-member.entity';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: OrganizationRole, example: OrganizationRole.MANAGER })
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
