import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerStatus } from '../entities/customer.entity';

/**
 * Query params for listing customers. No existing endpoint in the
 * codebase (e.g. listMembers) currently paginates or filters — this
 * is the first list endpoint to need it, so there's no established
 * convention to mirror. Kept deliberately minimal (status filter,
 * free-text search, page/limit) rather than designing a general
 * pagination utility that might not match what Product/Supplier
 * lists end up needing.
 *
 * @Type(() => Number) is required on page/limit because query
 * string values arrive as strings; class-transformer's ValidationPipe
 * must be configured with `transform: true` for this to take effect
 * at the controller layer (a Step 4 concern, not this DTO).
 */
export class CustomerQueryDto {
  @ApiPropertyOptional({ enum: CustomerStatus, example: CustomerStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({
    example: 'chisom',
    description: 'Free-text search across displayName and email',
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
