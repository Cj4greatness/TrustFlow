import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty({
    description: 'The membership UUID of the member becoming Owner',
  })
  @IsUUID()
  newOwnerMemberId: string;
}
