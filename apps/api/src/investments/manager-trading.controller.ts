import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { PlaceOrderDto } from './dto/place-order.dto';
import { TradingService } from './trading.service';

/**
 * The Manager Trading Terminal (MVP18). Every route below a specific strategy id re-checks that
 * assignment on every call — `StrategyAssignmentsService.assertAssigned` — rather than trusting
 * a role claim alone: `TRADER`/`INVESTMENT_MANAGER` is necessary but not sufficient, and "a
 * trader assigned to strategy A cannot trade strategy B" (the MVP18 acceptance criterion) is
 * exactly what that check exists to prove.
 */
@ApiTags('manager: trading terminal')
@Controller('manager/strategies')
@Roles(UserRole.TRADER, UserRole.INVESTMENT_MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
export class ManagerTradingController {
  constructor(private readonly trading: TradingService) {}

  @Get()
  @ApiOperation({ summary: 'AUM overview across every strategy you are assigned to trade' })
  overview(@CurrentUser() user: JwtPayload) {
    return this.trading.overview(user.sub);
  }

  @Get(':id/positions')
  @ApiOperation({ summary: 'Per-asset holdings and exposure for one strategy pool' })
  positions(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.trading.positions(id, user.sub, user.roles);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Order history for one strategy' })
  listOrders(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.trading.listOrders(id, user.sub, user.roles);
  }

  @Post(':id/orders')
  @ApiOperation({ summary: 'Place a MARKET, LIMIT (take-profit shape) or STOP (stop-loss shape) order' })
  placeOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PlaceOrderDto) {
    return this.trading.placeOrder(id, user.sub, user.roles, dto);
  }

  @Post(':id/orders/:orderId/cancel')
  @ApiOperation({ summary: 'Cancel a PENDING order' })
  cancelOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('orderId') orderId: string,
  ) {
    return this.trading.cancelOrder(id, orderId, user.sub, user.roles);
  }
}
