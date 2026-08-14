import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { RedeemDto, SubscribeDto } from './dto/subscribe.dto';
import { InvestmentStrategiesService } from './investment-strategies.service';
import { SubscriptionsService } from './subscriptions.service';

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
  constructor(
    private readonly strategies: InvestmentStrategiesService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

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

  /**
   * Commit capital. Money leaves AVAILABLE immediately into PENDING_SUBSCRIPTION — still the
   * investor's — and units are issued later at a dealing point, so nobody deals at a stale
   * price. Refused without a recorded acceptance of the current risk disclosure.
   */
  @Post(':slug/subscribe')
  @ApiOperation({ summary: 'Commit capital to a strategy (settles at the next dealing point)' })
  subscribe(@CurrentUser() user: JwtPayload, @Param('slug') slug: string, @Body() dto: SubscribeDto) {
    return this.subscriptions.subscribe(user.sub, slug, dto.amount, dto.idempotencyKey);
  }

  @Delete('subscriptions/:requestId')
  @ApiOperation({ summary: 'Cancel before the dealing point — full refund, no fee' })
  cancel(@CurrentUser() user: JwtPayload, @Param('requestId') requestId: string) {
    return this.subscriptions.cancelSubscription(user.sub, requestId);
  }

  @Post(':slug/redeem')
  @ApiOperation({ summary: 'Request redemption of units (settles at a dealing point)' })
  redeem(@CurrentUser() user: JwtPayload, @Param('slug') slug: string, @Body() dto: RedeemDto) {
    return this.subscriptions.requestRedemption(
      user.sub,
      slug,
      dto.units === 'ALL' ? 'ALL' : dto.units,
      dto.idempotencyKey,
    );
  }
}
