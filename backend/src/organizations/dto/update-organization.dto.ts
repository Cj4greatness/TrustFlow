import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields an organization owner/admin can update. Excludes slug
 * (immutable once set — changing it would break any external
 * references) and status/subscriptionPlan (managed by dedicated
 * flows, not a generic profile edit).
 */
export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Johnson Electronics Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Electronics Retail' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  industry?: string;

  @ApiPropertyOptional({ example: 'Nigeria' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  country?: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logos/123.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo?: string;
}
