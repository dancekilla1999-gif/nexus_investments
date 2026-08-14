import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { SubscriptionsService } from './subscriptions.service';

/** The investor's own positions and in-flight requests. Never shows anyone else's. */
@ApiTags('investments')
@Controller('investments/me')
export class MyInvestmentsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('positions')
  @ApiOperation({ summary: 'Units held, value, cost basis and high water mark per strategy' })
  positions(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.listMyInvestments(user.sub);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Subscriptions and redemptions, pending and settled' })
  requests(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.listMyRequests(user.sub);
  }
}
