import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const SUPPORTED_ORGANIZATION_CURRENCIES = ['NGN'] as const;
const UNSUPPORTED_CURRENCY_MESSAGE =
  'Only NGN organizations are supported in this release';

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
    enum: [...SUPPORTED_ORGANIZATION_CURRENCIES],
    description:
      'Organization currency. Only NGN is supported in this release.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString({ message: UNSUPPORTED_CURRENCY_MESSAGE })
  @IsNotEmpty({ message: UNSUPPORTED_CURRENCY_MESSAGE })
  @IsIn([...SUPPORTED_ORGANIZATION_CURRENCIES], {
    message: UNSUPPORTED_CURRENCY_MESSAGE,
  })
  currency?: (typeof SUPPORTED_ORGANIZATION_CURRENCIES)[number];
}
