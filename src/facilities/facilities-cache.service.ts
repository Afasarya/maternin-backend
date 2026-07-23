import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class FacilitiesCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(FacilitiesCacheService.name);
  private readonly redis: Redis;

  constructor(configService: ConfigService) {
    this.redis = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) =>
        attempt <= 3 ? Math.min(attempt * 200, 1000) : null,
    });

    this.redis.on('error', () => {
      this.logger.warn('Redis facilities cache tidak tersedia');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);

      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache fails open; Nominatim response remains usable.
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
