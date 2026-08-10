import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerAddressType } from '../entities/customer-address.entity';

/**
 * Fields a caller provides when adding an address to a customer.
 * customerId and organizationId are excluded — both come from route
 * params (:customerId, :id), matching how CreateInvitationDto omits
 * organizationId for the same reason.
 */
export class CreateCustomerAddressDto {
  @ApiPropertyOptional({
    enum: CustomerAddressType,
    example: CustomerAddressType.SHIPPING,
  })
  @IsOptional()
  @IsEnum(CustomerAddressType)
  type?: CustomerAddressType;

  @ApiProperty({ example: '12 Admiralty Way' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  line1: string;

  @ApiPropertyOptional({ example: 'Suite 4B' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string;

  @ApiProperty({ example: 'Lekki' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

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

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
