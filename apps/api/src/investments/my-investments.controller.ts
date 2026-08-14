import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { AllocationService } from './allocation.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

/** The investor's own positions and in-flight requests. Never shows anyone else's. */
@ApiTags('investments')
@Controller('investments/me')
export class MyInvestmentsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly allocation: AllocationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('positions')
  @ApiOperation({ summary: 'Units held, value, cost basis and high water mark per strategy' })
  positions(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.listMyInvestments(user.sub);
  }

  /**
   * The investor's share of what the pool actually holds — the "BTC 35% / ETH 25%" view.
   * Derived from units on read, so it can never disagree with the pool.
   */
  @Get('positions/:slug/exposure')
  @ApiOperation({ summary: "This investor's share of the pool's holdings, asset by asset" })
  async exposure(@CurrentUser() user: JwtPayload, @Param('slug') slug: string) {
    const strategy = await this.prisma.investmentStrategy.findUnique({ where: { slug } });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }
    return this.allocation.exposureForInvestor(user.sub, strategy.id);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Subscriptions and redemptions, pending and settled' })
  requests(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.listMyRequests(user.sub);
  }
}
