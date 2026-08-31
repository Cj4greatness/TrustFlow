import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a caller provides when associating a product with a
 * supplier. organizationId and supplierId are excluded (route
 * params: :id, :supplierId) — but productId is NOT derivable from
 * the route under the locked nesting
 * (organizations/:id/suppliers/:supplierId/products), so it must be
 * client-supplied here. This is a deliberate difference from every
 * other create DTO in the codebase, which excludes all parent IDs.
 *
 * unitCost accepted as a number for the same reason as
 * CreateProductDto.sellingPrice — the entity stores it as `string`
 * (honest decimal representation), conversion happens in the
 * service at persist time.
 */
export class CreateSupplierProductDto {
  @ApiProperty({ description: 'UUID of the product this supplier provides' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ example: 'SUP-SKU-4521' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierSku?: string;

  @ApiPropertyOptional({ example: 8500.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumOrderQuantity?: number;
}
