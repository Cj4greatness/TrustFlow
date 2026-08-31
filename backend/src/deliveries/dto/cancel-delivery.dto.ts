import { IsNotEmpty, IsString } from 'class-validator';

export class CancelDeliveryDto {
  @IsString()
  @IsNotEmpty()
  cancellationReason: string;
}
