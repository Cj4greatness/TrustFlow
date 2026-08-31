import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerType, CustomerStatus } from '../entities/customer.entity';

/**
 * Fields a caller can update on a customer. Hand-written with every
 * field optional, matching UpdateOrganizationDto/UpdateUserDto
 * rather than generating this via PartialType — no existing DTO in
 * the codebase uses PartialType, so this follows the established
 * pattern instead of introducing a new one.
 *
 * organizationId and createdBy are immutable and excluded, same
 * reasoning as CreateCustomerDto. customerType is left updatable
 * (unlike UpdateOrganizationDto excluding slug) since there's no
 * documented reason yet to lock it — any resulting inconsistency
 * between customerType and name fields is a business-rule concern
 * for the Step 3 service, not a shape concern for this DTO.
 */
export class UpdateCustomerDto {
  @ApiPropertyOptional({ enum: CustomerType, example: CustomerType.BUSINESS })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

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

  @ApiPropertyOptional({
    enum: CustomerStatus,
    example: CustomerStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ example: 'referral' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}
