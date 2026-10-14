import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../../redis/redis.service';

const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockedKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockPttl = redis.call('PTTL', blockedKey)
if blockPttl > 0 then
  local hits = tonumber(redis.call('GET', hitsKey)) or limit
  local hitsPttl = redis.call('PTTL', hitsKey)
  if hitsPttl < 0 then hitsPttl = ttl end
  return {hits, math.ceil(hitsPttl / 1000), 1, math.ceil(blockPttl / 1000)}
end

local totalHits = redis.call('INCR', hitsKey)
if totalHits == 1 then
  redis.call('PEXPIRE', hitsKey, ttl)
end
local hitsPttl = redis.call('PTTL', hitsKey)
if hitsPttl < 0 then hitsPttl = ttl end

local isBlocked = 0
local timeToBlockExpire = 0
if totalHits > limit then
  redis.call('SET', blockedKey, 1, 'PX', blockDuration)
  isBlocked = 1
  timeToBlockExpire = math.ceil(blockDuration / 1000)
end

return {totalHits, math.ceil(hitsPttl / 1000), isBlocked, timeToBlockExpire}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redisService.getClient();
    const hitsKey = `throttle:{${key}}:${throttlerName}:hits`;
    const blockedKey = `throttle:{${key}}:${throttlerName}:blocked`;

    const result = (await client.eval(
      INCREMENT_SCRIPT,
      2,
      hitsKey,
      blockedKey,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];

    const [totalHits, timeToExpire, isBlockedRaw, timeToBlockExpire] = result;

    return {
      totalHits,
      timeToExpire,
      isBlocked: isBlockedRaw === 1,
      timeToBlockExpire,
    };
  }
}
