import { BadRequestException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TIMEFRAMES, Timeframe } from '../marketdata/ohlcv-provider.interface';
import { FeatureEngineService } from './feature-engine.service';
import { FeatureStoreService } from './feature-store.service';
import { buildFeatureSet, featureSetVersion } from './registry';

/**
 * Operator visibility into the feature layer.
 *
 * Read-only apart from `compute`, which takes a symbol, a timeframe and an instant — and no
 * values. There is no endpoint that writes a feature: a hand-set feature is a hand-set model
 * input, and the whole point of the offline/online invariant is that every number came from the
 * same code over the same data.
 */
@ApiTags('admin: features')
@Controller('admin/features')
@Roles(UserRole.INVESTMENT_MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminFeaturesController {
  constructor(
    private readonly engine: FeatureEngineService,
    private readonly store: FeatureStoreService,
  ) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Every feature id, version, category and warmup requirement' })
  catalog(@Query('timeframe') timeframe = '1h') {
    const tf = assertTimeframe(timeframe);
    const set = buildFeatureSet(tf);
    const byCategory: Record<string, number> = {};
    for (const s of set) byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;

    return {
      timeframe: tf,
      anchorFeatures: set.length,
      totalColumns: this.engine.columnCount(tf),
      contextTimeframes: this.engine.higherTimeframesFor(tf),
      featureSetVersion: featureSetVersion(set),
      byCategory,
      features: set.map((s) => ({
        id: s.id,
        version: s.version,
        category: s.category,
        warmupBars: s.warmupBars,
      })),
    };
  }

  @Get('compute')
  @ApiOperation({ summary: 'Compute a vector at an instant, without recording it' })
  async compute(
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: string,
    @Query('asOf') asOf?: string,
  ) {
    if (!symbol || !timeframe) {
      throw new BadRequestException({
        code: 'MISSING_PARAMETERS',
        message: 'symbol and timeframe are required.',
      });
    }
    const at = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException({ code: 'INVALID_AS_OF', message: 'asOf must be an ISO timestamp.' });
    }

    const { vector, quality } = await this.engine.compute({
      symbol: symbol.toUpperCase(),
      timeframe: assertTimeframe(timeframe),
      asOf: at,
    });

    // A refused gate is reported as a refusal with its reasons, not as an empty vector. The
    // caller must be able to tell "no data" from "all features happened to be null".
    if (!vector) {
      return { computed: false, quality, reason: 'Data quality gate refused; no vector produced.' };
    }
    return { computed: true, quality, vector };
  }

  @Post('record')
  @ApiOperation({ summary: 'Compute and record a vector for later skew verification' })
  async record(@Query('symbol') symbol: string, @Query('timeframe') timeframe: string) {
    if (!symbol || !timeframe) {
      throw new BadRequestException({
        code: 'MISSING_PARAMETERS',
        message: 'symbol and timeframe are required.',
      });
    }
    const { vector, quality } = await this.engine.compute({
      symbol: symbol.toUpperCase(),
      timeframe: assertTimeframe(timeframe),
      asOf: new Date(),
    });
    if (!vector) return { recorded: false, quality };
    const { stored } = await this.store.record(vector);
    return { recorded: stored, hash: vector.hash, missing: vector.missing.length, quality };
  }

  @Get('vectors')
  @ApiOperation({ summary: 'Recorded vectors for a pair' })
  vectors(@Query('symbol') symbol: string, @Query('timeframe') timeframe: string) {
    return this.store.recent(symbol?.toUpperCase() ?? '', assertTimeframe(timeframe ?? '1h'));
  }

  /**
   * The train/serve skew check, on demand. Recomputes a recorded instant and compares digests.
   * A mismatch is a production incident, not a rounding difference.
   */
  @Post('verify/:id')
  @ApiOperation({ summary: 'Recompute a recorded vector and compare it bit-for-bit' })
  verify(@Param('id') id: string) {
    return this.store.verifyNoSkew(id);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Sweep recent vectors for skew' })
  verifyRecent() {
    return this.store.verifyRecent();
  }
}

function assertTimeframe(value: string): Timeframe {
  if (!(TIMEFRAMES as readonly string[]).includes(value)) {
    throw new BadRequestException({
      code: 'UNSUPPORTED_TIMEFRAME',
      message: `Timeframe must be one of: ${TIMEFRAMES.join(', ')}.`,
    });
  }
  return value as Timeframe;
}
