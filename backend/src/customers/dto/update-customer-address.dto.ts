import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerAddressType } from '../entities/customer-address.entity';

/**
 * Fields a caller can update on an existing customer address.
 * Hand-written all-optional, matching UpdateOrganizationDto rather
 * than PartialType — no existing DTO in the codebase uses
 * PartialType.
 */
export class UpdateCustomerAddressDto {
  @ApiPropertyOptional({
    enum: CustomerAddressType,
    example: CustomerAddressType.BILLING,
  })
  @IsOptional()
  @IsEnum(CustomerAddressType)
  type?: CustomerAddressType;

  @ApiPropertyOptional({ example: '12 Admiralty Way' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line1?: string;

  @ApiPropertyOptional({ example: 'Suite 4B' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string;

  @ApiPropertyOptional({ example: 'Lekki' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: '106104' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Nigeria' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
