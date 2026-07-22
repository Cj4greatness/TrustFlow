import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Wraps the ioredis client in a NestJS-managed service so Redis
 * connection lifecycle (connect on startup, disconnect on shutdown)
 * is handled consistently, and other modules can inject this rather
 * than each creating their own client.
 *
 * No caching logic lives here yet — this is connection plumbing
 * only, per Sprint 2 scope. Caching, sessions, and rate limiting
 * will consume this service in later sprints.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host');
    const port = this.configService.get<number>('redis.port');

    this.client = new Redis({
      host,
      port,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Simple connectivity check used by the health endpoint — sends a
   * PING and expects PONG back.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
