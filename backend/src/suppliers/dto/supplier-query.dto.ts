import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierStatus } from '../entities/supplier.entity';

/**
 * Mirrors CustomerQueryDto/ProductQueryDto's pagination shape
 * exactly, per Directive v1 §4: "Search/filtering should follow the
 * Customer conventions."
 */
export class SupplierQueryDto {
  @ApiPropertyOptional({ enum: SupplierStatus, example: SupplierStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;

  @ApiPropertyOptional({
    example: 'wholesale',
    description: 'Free-text search across name and email',
  })
  @IsOptional()
  @IsString()
  search?: string;

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
