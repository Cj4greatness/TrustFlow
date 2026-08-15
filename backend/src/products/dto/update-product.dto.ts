import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../entities/product.entity';

/**
 * Fields a caller can update on a product. Hand-written with every
 * field optional, matching UpdateCustomerDto rather than PartialType
 * — no existing DTO in the codebase uses PartialType.
 *
 * organizationId and createdBy are immutable, same reasoning as
 * UpdateCustomerDto. sku is left updatable — no directive language
 * restricts it — with uniqueness re-checked in the service the same
 * way email uniqueness is re-checked in updateCustomer().
 */
export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Wireless Mouse (2024 Edition)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'SKU-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ example: 'Electronics' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 'piece' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @ApiPropertyOptional({ example: 4800.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ example: 3200.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ enum: ProductStatus, example: ProductStatus.ARCHIVED })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
