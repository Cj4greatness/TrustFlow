import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../entities/product.entity';

/**
 * Fields a caller provides when creating a product. Notably absent:
 * organizationId (comes from the :id route param, matching
 * CreateCustomerDto) and createdBy (comes from the authenticated
 * user, not client-supplied).
 *
 * sellingPrice/costPrice are accepted as numbers here even though
 * Product.sellingPrice/costPrice are typed as `string` on the
 * entity (TypeORM's honest representation of a `decimal` column
 * with no transformer configured — see product.entity.ts). The
 * conversion to string happens in the service layer at persist
 * time; this DTO layer only validates the wire-format number a
 * client would naturally send.
 */
export class CreateProductDto {
  @ApiProperty({ example: 'Wireless Mouse' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Ergonomic wireless mouse, 2.4GHz' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku: string;

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

  @ApiProperty({ example: 4500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice: number;

  @ApiPropertyOptional({ example: 3000.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ enum: ProductStatus, example: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
