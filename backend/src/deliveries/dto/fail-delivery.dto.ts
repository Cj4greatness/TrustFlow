import { IsNotEmpty, IsString } from 'class-validator';

export class FailDeliveryDto {
  @IsString()
  @IsNotEmpty()
  failureReason: string;
}
