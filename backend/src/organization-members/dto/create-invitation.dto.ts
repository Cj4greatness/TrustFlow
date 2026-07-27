import { IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrganizationRole } from '../entities/organization-member.entity';

export class CreateInvitationDto {
  @ApiProperty({ example: 'newstaff@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: OrganizationRole, example: OrganizationRole.STAFF })
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
