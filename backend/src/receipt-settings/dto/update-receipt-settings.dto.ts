import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateReceiptSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'accentColor must be a 6-digit hex color, e.g. #2563EB',
  })
  accentColor?: string;
}
