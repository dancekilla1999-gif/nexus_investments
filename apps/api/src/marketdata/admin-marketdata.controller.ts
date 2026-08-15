import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CandleRepository } from './candle.repository';
import { DataQualityService } from './data-quality.service';
import { IngestionService } from './ingestion.service';
import { TIMEFRAMES, Timeframe } from './ohlcv-provider.interface';
import { ProviderRegistryService } from './provider-registry.service';

/**
 * Operator visibility into the data layer. Read-mostly by design: there is no endpoint here
 * that writes a candle, sets a reliability score, or clears a quality failure. Data is either
 * observed from a provider or it does not exist, and a score somebody can type is not a
 * measurement.
 */
@ApiTags('admin: market data')
@Controller('admin/market-data')
@Roles(UserRole.INVESTMENT_MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminMarketDataController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly candles: CandleRepository,
    private readonly quality: DataQualityService,
    private readonly registry: ProviderRegistryService,
  ) {}

  @Get('providers')
  @ApiOperation({ summary: 'Configured providers and their measured reliability' })
  providers() {
    return this.registry.listProviders();
  }

  @Get('coverage')
  @ApiOperation({ summary: 'Stored bars per (symbol, timeframe, source)' })
  coverage() {
    return this.candles.coverage();
  }

  /**
   * Pull now rather than waiting for the interval. Takes a symbol and a timeframe and nothing
   * else — notably not a price, a bar, or a time range to fabricate.
   */
  @Post('ingest')
  @ApiOperation({ summary: 'Trigger one ingestion pass' })
  async ingest(@Body() body: { symbol?: string; timeframe?: string }) {
    if (!body.symbol && !body.timeframe) return this.ingestion.ingestAll();

    if (!body.symbol || !body.timeframe) {
      throw new BadRequestException({
        code: 'INCOMPLETE_INGEST_REQUEST',
        message: 'Provide both symbol and timeframe, or neither to ingest everything configured.',
      });
    }
    const timeframe = assertTimeframe(body.timeframe);
    return this.ingestion.ingest(body.symbol.toUpperCase(), timeframe);
  }

  /**
   * Run the gate for a symbol as of an instant. `asOf` is required and has no default — the
   * whole point of the gate is that it answers "was this knowable *then*", and defaulting to
   * now is how that question quietly becomes "is this fine right now".
   */
  @Get('quality')
  @ApiOperation({ summary: 'Evaluate the data quality gate for a symbol at an instant' })
  async qualityCheck(
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: string,
    @Query('asOf') asOf: string,
  ) {
    if (!symbol || !timeframe || !asOf) {
      throw new BadRequestException({
        code: 'MISSING_PARAMETERS',
        message: 'symbol, timeframe and asOf are all required.',
      });
    }
    const at = new Date(asOf);
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException({ code: 'INVALID_AS_OF', message: 'asOf must be an ISO timestamp.' });
    }
    return this.quality.evaluate({
      symbol: symbol.toUpperCase(),
      timeframe: assertTimeframe(timeframe),
      asOf: at,
      record: false,
    });
  }

  @Get('quality/failures')
  @ApiOperation({ summary: 'Why the gate has been refusing — the answer to "why was it quiet?"' })
  failures() {
    return this.quality.recentFailures();
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
