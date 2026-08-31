import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a user can update about their own profile. Deliberately
 * excludes email and password — those go through dedicated flows
 * (email change verification, password reset) once Auth is built,
 * not a generic profile update.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Chisom' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Johnson' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/123.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;
}
