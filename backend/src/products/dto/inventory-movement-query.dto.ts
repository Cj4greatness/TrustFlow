import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query params for listing a product's inventory movement history.
 * Mirrors CustomerQueryDto/ProductQueryDto's pagination shape.
 * No status/search filter — movements don't have a status field,
 * and free-text search across `reason` wasn't specified by the
 * directive, so it's left out rather than invented.
 */
export class InventoryMovementQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
