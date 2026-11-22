import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, minutes } from '@nestjs/throttler';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { RedisThrottlerStorage } from './throttling/redis-throttler-storage.service';
import { RedisThrottlerStorageModule } from './throttling/redis-throttler-storage.module';
import { getAuthClientIp } from './throttling/auth-client-ip';
import { UsersModule } from '../users/users.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    UsersModule,
    SecurityModule,
    RedisThrottlerStorageModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: configService.get<string>(
            'jwt.accessExpiresIn',
          ) as StringValue,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisThrottlerStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: 'ip',
            ttl: minutes(15),
            limit: 5,
            getTracker: (req: Record<string, unknown>) => getAuthClientIp(req),
          },
          {
            name: 'email',
            ttl: minutes(15),
            limit: 5,
            getTracker: (req: Record<string, unknown>) => {
              const body = req.body as Record<string, unknown> | undefined;
              const rawEmail = body?.email;
              const email =
                typeof rawEmail === 'string'
                  ? rawEmail.trim().toLowerCase()
                  : '';
              return `email:${email}`;
            },
          },
        ],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, AuthThrottlerGuard],
  exports: [AuthService],
})
export class AuthModule {}
