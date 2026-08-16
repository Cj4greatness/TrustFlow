import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a caller can update on an existing supplier-product
 * association. productId is deliberately excluded — Directive v1 §5
 * doesn't describe re-pointing an association to a different
 * product; that would effectively be a new association, not an
 * update to this one. supplierSku/unitCost/leadTimeDays/MOQ are all
 * supplier-specific procurement data, which is exactly what this
 * endpoint exists to update.
 */
export class UpdateSupplierProductDto {
  @ApiPropertyOptional({ example: 'SUP-SKU-4521' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierSku?: string;

  @ApiPropertyOptional({ example: 9000.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumOrderQuantity?: number;
}
