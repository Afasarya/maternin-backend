import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RiskAssessmentsCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RiskAssessmentsCacheService.name);
  private readonly redis: Redis;
  private readonly bypassKeys = new Set<string>();

  constructor(configService: ConfigService) {
    this.redis = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) =>
        attempt <= 3 ? Math.min(attempt * 200, 1000) : null,
    });

    this.redis.on('error', () => {
      this.logger.warn('Redis risk assessment cache tidak tersedia');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.bypassKeys.has(key)) {
      return null;
    }

    try {
      const value = await this.redis.get(key);

      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async getVersion(key: string): Promise<string | null> {
    try {
      return (await this.redis.get(key)) ?? '0';
    } catch {
      return null;
    }
  }

  async setIfVersion(
    key: string,
    value: unknown,
    ttlSeconds: number,
    versionKey: string,
    expectedVersion: string,
  ): Promise<boolean> {
    const script = `
      local current_version = redis.call('GET', KEYS[2]) or '0'
      if current_version ~= ARGV[1] then
        return 0
      end
      redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
      return 1
    `;

    try {
      const result = await this.redis.eval(
        script,
        2,
        key,
        versionKey,
        expectedVersion,
        JSON.stringify(value),
        String(ttlSeconds),
      );

      if (result === 1) {
        this.bypassKeys.delete(key);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async invalidate(versionKey: string, ...keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    const script = `
      redis.call('INCR', KEYS[1])
      for index = 2, #KEYS do
        redis.call('DEL', KEYS[index])
      end
      return 1
    `;

    try {
      await this.redis.eval(script, keys.length + 1, versionKey, ...keys);
      keys.forEach((key) => this.bypassKeys.delete(key));
    } catch {
      keys.forEach((key) => this.bypassKeys.add(key));
      this.logger.warn(
        'Invalidasi Redis risk assessment gagal; cache lokal dilewati',
      );
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
