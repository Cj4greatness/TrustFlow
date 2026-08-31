import { UserResponseDto } from '../../users/dto/user-response.dto';

export interface AuthResponse {
  user: UserResponseDto;
  accessToken: string;
  refreshToken: string;
}
