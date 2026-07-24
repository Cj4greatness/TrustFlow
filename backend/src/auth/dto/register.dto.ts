import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Chisom' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Johnson' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: 'chisom@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'SecurePass123',
    description:
      'Minimum 8 characters, must include uppercase, lowercase, and a number.',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
