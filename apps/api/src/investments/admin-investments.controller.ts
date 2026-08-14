import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { StrikeDealingPointDto } from './dto/subscribe.dto';
import { DealingService } from './dealing.service';
import { SetStrategyStatusDto } from './dto/set-status.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { InvestmentStrategiesService } from './investment-strategies.service';

/**
 * Strategy administration. Separate namespace and separate guard stack from the investor API
 * (docs/05 §2), and every route writes an audit row naming the acting operator.
 *
 * Note what is absent: there is no endpoint here that moves value. Creating and configuring a
 * product is configuration authority; it is deliberately not economic authority, and the
 * ledger's boundary trigger means it could not become one by accident (docs/12 §8).
 */
@ApiTags('admin: investments')
@Controller('admin/investments/strategies')
@Roles(UserRole.INVESTMENT_MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminInvestmentsController {
  constructor(
    private readonly strategies: InvestmentStrategiesService,
    private readonly dealing: DealingService,
  ) {}

  @Get()
  list() {
    return this.strategies.listForManager();
  }

  @Post()
  @ApiOperation({ summary: 'Create a strategy in DRAFT' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateStrategyDto) {
    return this.strategies.create(user.sub, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateStrategyDto) {
    return this.strategies.update(user.sub, id, dto);
  }

  @Post(':id/open')
  @ApiOperation({
    summary: 'Open for subscription — refused without a passing backtest',
  })
  open(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.strategies.open(user.sub, id);
  }

  /**
   * Strike a dealing point: value the pool, then settle every pending subscription and due
   * redemption at that one price. Valuing first is what stops new money from either capturing
   * existing holders' gains or being diluted by them.
   */
  @Post(':id/dealing-point')
  @ApiOperation({ summary: 'Strike a NAV and settle pending subscriptions and redemptions' })
  strikeDealingPoint(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: StrikeDealingPointDto,
  ) {
    return this.dealing.strikeDealingPoint(id, dto.markSource, user.sub);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetStrategyStatusDto,
  ) {
    return this.strategies.setStatus(user.sub, id, dto.status);
  }
}
