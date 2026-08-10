import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { CustomerType, CustomerStatus } from '../entities/customer.entity';

/**
 * Fields a caller provides when creating a customer. Notably
 * absent: organizationId (comes from the :id route param, per the
 * same pattern CreateInvitationDto follows) and createdBy (comes
 * from the authenticated user, not client-supplied).
 *
 * displayName is optional here rather than required — per the
 * architecture note on Customer, it's meant to be computed from
 * firstName/lastName or companyName when the caller doesn't supply
 * one directly. Enforcing "must have enough info to compute a
 * displayName" is a cross-field business rule, so it's left to the
 * Step 3 service layer rather than encoded here, matching how
 * CreateOrganizationDto doesn't enforce slug uniqueness itself
 * either.
 */
export class CreateCustomerDto {
  @ApiProperty({ enum: CustomerType, example: CustomerType.INDIVIDUAL })
  @IsEnum(CustomerType)
  customerType: CustomerType;

  @ApiPropertyOptional({ example: 'Chisom Johnson' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Chisom' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Johnson' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Johnson Electronics' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @ApiPropertyOptional({ example: 'customer@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ enum: CustomerStatus, example: CustomerStatus.LEAD })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ example: 'referral' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}
