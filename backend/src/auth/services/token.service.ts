import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { User } from '../../users/entities/user.entity';
import { JwtPayload } from '../types/jwt-payload.type';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Issues and verifies the access/refresh token pair. Access tokens
 * are short-lived and used on every request; refresh tokens are
 * long-lived and only used at /auth/refresh to mint a new access
 * token, supporting rotation and revocation (see AuthService).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private buildPayload(user: User): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
    };
  }

  generateTokenPair(user: User): TokenPair {
    const payload = this.buildPayload(user);

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>(
        'jwt.accessExpiresIn',
      ) as StringValue,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>(
        'jwt.refreshExpiresIn',
      ) as StringValue,
    });

    return { accessToken, refreshToken };
  }

  verifyRefreshToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
    });
  }
}
