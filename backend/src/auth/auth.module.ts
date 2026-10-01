import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ThrottlerModule,
  minutes,
  normalizeIp,
  DEFAULT_IPV6_SUBNET_PREFIX,
} from '@nestjs/throttler';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { RedisThrottlerStorage } from './throttling/redis-throttler-storage.service';
import { RedisThrottlerStorageModule } from './throttling/redis-throttler-storage.module';
import { UsersModule } from '../users/users.module';
import { SecurityModule } from '../security/security.module';

const isTestEnvironment = (): boolean =>
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

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
            getTracker: (req: Record<string, unknown>) => {
              if (isTestEnvironment()) {
                const headers = req.headers as
                  Record<string, unknown> | undefined;
                const testIp = headers?.['x-test-client-ip'];
                if (typeof testIp === 'string' && testIp.length > 0) {
                  return testIp;
                }
              }
              const ip = (req as { ip?: string }).ip ?? '';
              return normalizeIp(ip, DEFAULT_IPV6_SUBNET_PREFIX);
            },
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
