import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { AppConfigService } from '../config/app-config.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const healthy = database.ok && redis.ok;
    if (!healthy) {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'One or more dependencies are unreachable.',
        details: { database, redis },
      });
    }

    return {
      status: 'ok',
      platformMode: this.config.platformMode,
      dependencies: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<{ ok: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false };
    }
  }

  private async checkRedis(): Promise<{ ok: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false };
    }
  }
}
