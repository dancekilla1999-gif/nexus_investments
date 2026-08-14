import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { InvestmentStrategiesService } from './investment-strategies.service';

/**
 * The investor-facing marketplace.
 *
 * Public on purpose: a prospective investor should be able to read the terms, fees, lock-up and
 * risk limits of a product *before* creating an account, in the same way the risk disclosure is
 * readable without registering. Nothing here exposes another investor's position.
 */
@ApiTags('investments')
@Controller('investments/strategies')
export class InvestmentsController {
  constructor(private readonly strategies: InvestmentStrategiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Investment products currently open or holding capital' })
  list() {
    return this.strategies.listMarketplace();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Full terms for one product — fees, lock-up, limits, risk' })
  get(@Param('slug') slug: string) {
    return this.strategies.getBySlug(slug);
  }
}
