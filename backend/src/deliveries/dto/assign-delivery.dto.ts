import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignDeliveryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  assignedDeliveryPerson: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  trackingReference?: string;
}
