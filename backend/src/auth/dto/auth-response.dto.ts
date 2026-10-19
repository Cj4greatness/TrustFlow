import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * Response of POST /auth/register, /auth/login and /auth/refresh.
 * Mirrors the AuthResponse interface the service returns; this class
 * exists so the OpenAPI document (and the frontend client generated
 * from it) carries the real shape.
 */
export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({
    description:
      'Short-lived JWT (15 minutes by default). Send as `Authorization: Bearer <token>`.',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Long-lived refresh token (7 days by default). Single-use: every /auth/refresh rotates it. Keep it out of JS-readable storage (the BFF holds it in a Secure HttpOnly cookie).',
  })
  refreshToken: string;
}
