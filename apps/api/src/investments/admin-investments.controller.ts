import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { StrikeDealingPointDto } from './dto/subscribe.dto';
import { DealingService } from './dealing.service';
import { FeesService } from './fees.service';
import { AllocationService } from './allocation.service';
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
    private readonly allocation: AllocationService,
    private readonly fees: FeesService,
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
    return this.dealing.strikeDealingPoint(id, dto.reason, user.sub);
  }

  /**
   * Bring fee accruals up to the current valuation without charging anything.
   *
   * Takes no amount: the charge is `max(0, navPerUnit − hwm) × units × rate`, computed from a
   * NAV the manager cannot influence and a rate stored on the strategy. There is no parameter
   * here through which a number could be typed.
   */
  @Post(':id/accrue-fees')
  @ApiOperation({ summary: 'Mark fee accruals to the current NAV (no money moves)' })
  accrueFees(@Param('id') id: string) {
    return this.fees.accrue(id);
  }

  /**
   * Settle what has accrued: units cancelled, cash to platform revenue, high water mark
   * ratcheted. Restricted above INVESTMENT_MANAGER — accruing is bookkeeping, but crystallising
   * is the moment investor money becomes platform money, and the manager is its beneficiary.
   */
  @Post(':id/crystallise-fees')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Charge accrued fees and ratchet each high water mark' })
  crystalliseFees(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fees.crystallise(id, user.sub);
  }

  /**
   * What the next dealing point will do to the pool's cash. The manager needs this *before*
   * settlement — discovering a shortfall during it means queueing a redemption an investor was
   * told to expect.
   */
  @Get(':id/flows')
  @ApiOperation({ summary: 'Subscriptions in, redemptions out, and any cash shortfall' })
  flows(@Param('id') id: string) {
    return this.allocation.netFlows(id);
  }

  /**
   * Close the strategy and return everything pro rata. Takes no amount and no recipient: there
   * is deliberately nothing here for an operator to decide.
   */
  @Post(':id/wind-down')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Distribute a WINDING_DOWN strategy pro rata and close it' })
  windDown(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.allocation.windDown(id, user.sub);
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
