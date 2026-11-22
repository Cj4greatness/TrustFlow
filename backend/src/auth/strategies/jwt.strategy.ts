import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser, JwtPayload } from '../types/jwt-payload.type';
import { UsersRepository } from '../../users/users.repository';
import { UserStatus } from '../../users/entities/user.entity';
import { ACCOUNT_NOT_ACTIVE_ERROR } from '../account-status';

/**
 * Validates the short-lived access token sent as a Bearer header on
 * every authenticated request. On success, the returned object is
 * attached to `request.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_ERROR);
    }

    return {
      id: payload.sub,
      email: payload.email,
    };
  }
}
