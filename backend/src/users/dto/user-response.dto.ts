import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { UserStatus } from '../entities/user.entity';

/**
 * The only shape of a User ever returned by the API. Deliberately
 * excludes passwordHash, deletedAt, and any internal metadata — this
 * class defines the public contract, so a future change to the User
 * entity can never accidentally leak an internal field through the
 * API by omission.
 */
@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  firstName: string;

  @Expose()
  @ApiProperty()
  lastName: string;

  @Expose()
  @ApiProperty()
  email: string;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  phone: string | null;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  avatar: string | null;

  @Expose()
  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @Expose()
  @ApiProperty()
  emailVerified: boolean;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  lastLogin: Date | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
