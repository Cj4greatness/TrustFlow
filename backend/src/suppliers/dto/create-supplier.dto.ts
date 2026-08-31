import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierStatus } from '../entities/supplier.entity';

/**
 * Fields a caller provides when creating a supplier. organizationId
 * (route param) and createdBy (authenticated user) excluded, matching
 * CreateCustomerDto/CreateProductDto convention.
 *
 * Directive v1 §7: "Supplier email, when supplied, must be valid" —
 * enforced here via @IsEmail, same as CreateCustomerDto.
 */
export class CreateSupplierDto {
  @ApiProperty({ example: 'Lagos Wholesale Supplies Ltd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Adaeze Okonkwo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string;

  @ApiPropertyOptional({ example: 'supplier@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: '14 Balogun Street, Lagos Island' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Preferred supplier for electronics' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: SupplierStatus, example: SupplierStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;
}
