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

const RECENTLY_ROTATED_WINDOW_MS = 10_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * A valid Argon2 hash with no real matching password, computed once
   * and cached. Used in login() to pay Argon2's verification cost even
   * when no user exists for the submitted email, so response time
   * doesn't reveal which emails have accounts (timing side-channel /
   * email enumeration).
   */
  private dummyPasswordHash: Promise<string> | null = null;

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= this.passwordService.hash(
      'timing-safety-dummy-password',
    );
    return this.dummyPasswordHash;
  }

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

  /**
   * Argon2 verification always runs, on both the "user exists" and
   * "user doesn't exist" paths — against a cached dummy hash in the
   * latter case — so response time doesn't leak whether a submitted
   * email has an account. Without this, the no-such-user path returns
   * after a cheap DB lookup while the wrong-password path additionally
   * pays Argon2's (deliberately slow) cost, letting an attacker
   * measure timing to enumerate valid emails.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersRepository.findAuthUserByEmail(dto.email);

    const passwordMatches = await this.passwordService.verify(
      user?.passwordHash ?? (await this.getDummyPasswordHash()),
      dto.password,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersRepository.updateLastLogin(user.id);

    return this.issueTokensAndBuildResponse(user);
  }

  /**
   * Rotates a refresh token via compare-and-swap rather than a plain
   * read-verify-write, to close a concurrency gap: two simultaneous
   * refresh() calls with the same valid token used to both pass
   * verification and both rotate, and whichever response the client
   * discarded as "stale" would fail on its next use — silently
   * logging the user out with no actual token theft involved.
   *
   * Now only one concurrent caller can win the rotation. A caller
   * that loses the race (or arrives just after another request
   * already rotated) is told REFRESH_TOKEN_RECENTLY_ROTATED via a
   * non-destructive 401 instead of having its session wiped — see
   * rejectAsRecentlyRotatedOrWipe(). Genuine reuse of a stale token
   * outside that grace window still wipes the session, unchanged
   * from before.
   */
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
      return this.rejectAsRecentlyRotatedOrWipe(user.id, refreshToken);
    }

    // Build the replacement pair before attempting the swap. If we
    // lose the race, these are discarded — never returned to the caller.
    const tokens = this.tokenService.generateTokenPair(user);
    const newRefreshTokenHash = await this.passwordService.hash(
      tokens.refreshToken,
    );

    const won = await this.usersRepository.rotateRefreshTokenHash(
      user.id,
      user.refreshTokenHash,
      newRefreshTokenHash,
    );

    if (!won) {
      return this.rejectAsRecentlyRotatedOrWipe(user.id, refreshToken);
    }

    return this.buildAuthResponse(user, tokens);
  }

  async logout(userId: string): Promise<void> {
    await this.usersRepository.updateRefreshTokenHash(userId, null);
  }

  /**
   * Called when a presented refresh token didn't win (or didn't
   * match) the current hash. Distinguishes a benign concurrent-
   * rotation race from genuine token reuse:
   *  - matches previousRefreshTokenHash AND within the grace window
   *    -> non-destructive 401, session left intact
   *  - otherwise -> treated as theft, session wiped (unchanged
   *    behavior from before this fix)
   */
  private async rejectAsRecentlyRotatedOrWipe(
    userId: string,
    presentedToken: string,
  ): Promise<never> {
    const user = await this.usersRepository.findById(userId);

    const withinWindow =
      !!user?.refreshTokenRotatedAt &&
      Date.now() - user.refreshTokenRotatedAt.getTime() <=
        RECENTLY_ROTATED_WINDOW_MS;

    const matchesPrevious =
      withinWindow &&
      !!user?.previousRefreshTokenHash &&
      (await this.passwordService.verify(
        user.previousRefreshTokenHash,
        presentedToken,
      ));

    if (matchesPrevious) {
      throw new UnauthorizedException({
        message: 'Refresh token was already rotated by a concurrent request',
        code: 'REFRESH_TOKEN_RECENTLY_ROTATED',
      });
    }

    // Genuine reuse/theft — invalidate the stored token so the
    // compromised refresh token can't be used again, even if
    // presented correctly a second time.
    await this.usersRepository.updateRefreshTokenHash(userId, null);
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  /**
   * Issues a fresh access/refresh token pair, persists the hashed
   * refresh token against the user (for future rotation/revocation
   * checks), and shapes the public response. Used by
   * register/login, where there's no prior token to race against so
   * an unconditional write is correct. refresh() does NOT call this
   * — its winning rotation is already persisted via the CAS in
   * rotateRefreshTokenHash(), so it calls buildAuthResponse()
   * directly to avoid writing the hash a second time.
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

    return this.buildAuthResponse(user, tokens);
  }

  /**
   * Shapes the public AuthResponse from a user and an already-issued
   * token pair. Persisting the token hash is the caller's
   * responsibility (see issueTokensAndBuildResponse vs. refresh's
   * own CAS) — this method only builds the response shape.
   */
  private buildAuthResponse(
    user: User,
    tokens: { accessToken: string; refreshToken: string },
  ): AuthResponse {
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
