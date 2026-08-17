import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '../entities/order.entity';

/**
 * Mirrors CustomerQueryDto/ProductQueryDto/SupplierQueryDto's
 * pagination shape. No free-text search field — the directive
 * doesn't specify one for Orders (order numbers/customer names
 * aren't mentioned as searchable), so filtering by status and
 * customerId only, rather than inventing a search field.
 */
export class OrderQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Filter orders by customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

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
