import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierStatus } from '../entities/supplier.entity';

/**
 * Hand-written, all fields optional — matching UpdateCustomerDto/
 * UpdateProductDto convention, not PartialType.
 */
export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'Lagos Wholesale Supplies Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

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

  @ApiPropertyOptional({
    enum: SupplierStatus,
    example: SupplierStatus.ARCHIVED,
  })
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;
}
