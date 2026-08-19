import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TIMEFRAMES, Timeframe } from '../marketdata/ohlcv-provider.interface';
import { DatasetSpec, ResearchService } from './research.service';

/**
 * The Research Lab's API surface (docs/18 §7).
 *
 * Two properties are structural rather than conventional. Every evaluation **increments the
 * trial counter**, so exploration is free but is not free of consequence. And there is no
 * endpoint here that promotes a model, writes a signal, or touches capital — the lab can only
 * produce evidence.
 */
@ApiTags('admin: research')
@Controller('admin/research')
@Roles(UserRole.INVESTMENT_MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminResearchController {
  constructor(private readonly research: ResearchService) {}

  @Post('dataset')
  @ApiOperation({ summary: 'Build a labelled dataset and report its balance' })
  async dataset(@Body() body: Partial<DatasetSpec>) {
    const spec = assertSpec(body);
    const { balance, labelDefinition, dataset } = await this.research.buildDataset(spec);
    return {
      labelDefinition,
      samples: dataset.X.length,
      features: dataset.featureNames.length,
      balance,
    };
  }

  /**
   * Purged, embargoed cross-validation. Reports how many samples were dropped, because a split
   * that purges nothing is a split that is not purging.
   */
  @Post('cross-validate')
  @ApiOperation({ summary: 'Purged, embargoed K-fold AUC' })
  async crossValidate(@Body() body: Partial<DatasetSpec> & { folds?: number }) {
    return this.research.crossValidate(assertSpec(body), body.folds ?? 5);
  }

  @Post('controls')
  @ApiOperation({ summary: 'Run the negative controls — the first thing to run, not the last' })
  async controls(@Body() body: Partial<DatasetSpec>) {
    return this.research.runControls(assertSpec(body));
  }

  /**
   * Walk-forward evaluation. **Counts as a trial**, whatever the outcome — counting only the
   * runs you liked would make the deflated Sharpe meaningless.
   */
  @Post('walk-forward')
  @ApiOperation({ summary: 'Walk-forward out-of-sample evaluation with a deflated Sharpe' })
  async walkForward(@Body() body: Partial<DatasetSpec> & { notes?: string }) {
    return this.research.walkForwardEvaluate({ spec: assertSpec(body), notes: body.notes });
  }

  @Get('trials')
  @ApiOperation({ summary: 'How many trials have been run in a scope' })
  async trials(@Query('scope') scope?: string) {
    if (!scope) return { experiments: await this.research.experiments(undefined, 50) };
    return { scope, count: await this.research.trialCount(scope) };
  }

  @Get('experiments')
  @ApiOperation({ summary: 'Every recorded run, newest first' })
  experiments(@Query('scope') scope?: string) {
    return this.research.experiments(scope);
  }
}

function assertSpec(body: Partial<DatasetSpec>): DatasetSpec {
  if (!body.symbol || !body.timeframe) {
    throw new BadRequestException({
      code: 'MISSING_PARAMETERS',
      message: 'symbol and timeframe are required.',
    });
  }
  if (!(TIMEFRAMES as readonly string[]).includes(body.timeframe)) {
    throw new BadRequestException({
      code: 'UNSUPPORTED_TIMEFRAME',
      message: `Timeframe must be one of: ${TIMEFRAMES.join(', ')}.`,
    });
  }
  const bars = body.bars ?? 1000;
  if (bars < 100 || bars > 20_000) {
    throw new BadRequestException({
      code: 'INVALID_BARS',
      message: 'bars must be between 100 and 20000.',
    });
  }
  return {
    symbol: body.symbol.toUpperCase(),
    timeframe: body.timeframe as Timeframe,
    bars,
    asOf: body.asOf ? new Date(body.asOf) : undefined,
    barrier: body.barrier,
    contextTimeframes: body.contextTimeframes,
  };
}
