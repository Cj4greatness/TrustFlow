import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  async check() {
    const databaseHealthy = this.dataSource.isInitialized;
    const redisHealthy = await this.redisService.isHealthy();

    const allHealthy = databaseHealthy && redisHealthy;

    const result = {
      status: allHealthy ? 'ok' : 'degraded',
      service: 'TrustFlow API',
      dependencies: {
        database: databaseHealthy ? 'ok' : 'unreachable',
        redis: redisHealthy ? 'ok' : 'unreachable',
      },
    };

    if (!allHealthy) {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
