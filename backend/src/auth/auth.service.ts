import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from '../security/password.service';
import { TokenService } from './services/token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AuthResponse } from './types/auth-response.type';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const emailTaken = await this.usersRepository.existsByEmail(dto.email);
    if (emailTaken) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = this.usersRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone ?? null,
      passwordHash,
    });

    const savedUser = await this.usersRepository.save(user);

    return this.issueTokensAndBuildResponse(savedUser);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersRepository.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwordService.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersRepository.updateLastLogin(user.id);

    return this.issueTokensAndBuildResponse(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersRepository.findById(payload.sub);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenMatches = await this.passwordService.verify(
      user.refreshTokenHash,
      refreshToken,
    );

    if (!tokenMatches) {
      // Possible token reuse/theft — invalidate the stored token so
      // the compromised refresh token can't be used again, even if
      // presented correctly a second time.
      await this.usersRepository.updateRefreshTokenHash(user.id, null);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.issueTokensAndBuildResponse(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersRepository.updateRefreshTokenHash(userId, null);
  }

  /**
   * Issues a fresh access/refresh token pair, persists the hashed
   * refresh token against the user (for future rotation/revocation
   * checks), and shapes the public response. Shared by
   * register/login/refresh so token issuance behaves identically
   * everywhere.
   *
   * The refresh token itself is hashed with the same PasswordService
   * used for user passwords before storage — never stored in plain
   * text, so a database read alone can't be used to impersonate a
   * user via their refresh token.
   */
  private async issueTokensAndBuildResponse(user: User): Promise<AuthResponse> {
    const tokens = this.tokenService.generateTokenPair(user);
    const refreshTokenHash = await this.passwordService.hash(
      tokens.refreshToken,
    );
    await this.usersRepository.updateRefreshTokenHash(
      user.id,
      refreshTokenHash,
    );

    const userResponse = new UserResponseDto({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      emailVerified: user.emailVerified,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    });

    return {
      user: userResponse,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
}
