import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a user provides when creating an organization. Notably
 * absent: slug (always generated, never user-supplied — per CTO
 * Rule 2, "Never require users to invent slugs manually"), and
 * status/subscriptionPlan (system-controlled, default to
 * pending_setup/trial on creation).
 */
export class CreateOrganizationDto {
  @ApiProperty({ example: 'Johnson Electronics' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

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

  @ApiPropertyOptional({
    example: 'NGN',
    description: '3-letter ISO currency code',
  })
  @IsOptional()
  @IsString()
  @IsIn(['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'RWF'])
  currency?: string;
}
