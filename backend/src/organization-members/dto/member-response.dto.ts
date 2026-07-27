import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { OrganizationRole } from '../entities/organization-member.entity';
import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * The only shape of a membership ever returned by the API. Nests
 * UserResponseDto (not the raw User entity) specifically so
 * passwordHash and refreshTokenHash can never leak through this
 * endpoint the way they briefly did before this fix — GET
 * /organizations/:id/members previously returned the raw entity
 * relation, bypassing the exclusion that protects every other
 * user-facing endpoint.
 */
@Exclude()
export class MemberResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty({ enum: OrganizationRole })
  role: OrganizationRole;

  @Expose()
  @ApiProperty()
  joinedAt: Date;

  @Expose()
  @Type(() => UserResponseDto)
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  constructor(partial: Partial<MemberResponseDto>) {
    Object.assign(this, partial);
  }
}
