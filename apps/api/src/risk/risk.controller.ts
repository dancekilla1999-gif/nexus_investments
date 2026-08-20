import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import {
  ProposeRiskLimitChangeDto,
  RejectRiskLimitChangeDto,
  SetEmergencyControlDto,
} from './dto/propose-risk-limit-change.dto';
import { EmergencyControlKey, EmergencyControlsService } from './emergency-controls.service';
import { RiskLimitsService } from './risk-limits.service';

/**
 * Risk administration (MVP19). Separate namespace from `admin/investments/strategies`: setting a
 * strategy's economic terms is `INVESTMENT_MANAGER`'s job; changing what it's allowed to risk is
 * `RISK_OPS`'s (docs/12 §8's `RISK_MANAGER` — this codebase's role enum already calls the same
 * seat `RISK_OPS`, e.g. `DepositsController.runReconciliation`). Every route here is
 * `RISK_OPS`/`ADMIN`/`SUPERADMIN` only.
 */
@ApiTags('risk')
@Controller('risk')
@Roles(UserRole.RISK_OPS, UserRole.ADMIN, UserRole.SUPERADMIN)
export class RiskController {
  constructor(
    private readonly limits: RiskLimitsService,
    private readonly emergency: EmergencyControlsService,
  ) {}

  // ── Dual-control risk-limit changes ─────────────────────────────────────

  @Get('strategies/:id/limit-changes')
  @ApiOperation({ summary: 'Pending risk-limit change proposals for one strategy' })
  listPending(@Param('id') id: string) {
    return this.limits.listPending(id);
  }

  @Post('strategies/:id/limit-changes')
  @ApiOperation({ summary: 'Propose a risk-limit change — takes effect only once someone else approves it' })
  propose(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ProposeRiskLimitChangeDto) {
    return this.limits.propose(id, dto.field, dto.newValue, user.sub);
  }

  @Post('limit-changes/:requestId/approve')
  @ApiOperation({ summary: 'Approve a pending risk-limit change — rejected if you proposed it' })
  approve(@CurrentUser() user: JwtPayload, @Param('requestId') requestId: string) {
    return this.limits.approve(requestId, user.sub);
  }

  @Post('limit-changes/:requestId/reject')
  @ApiOperation({ summary: "Formally reject someone else's pending proposal" })
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('requestId') requestId: string,
    @Body() dto: RejectRiskLimitChangeDto,
  ) {
    return this.limits.reject(requestId, user.sub, dto.reason);
  }

  @Post('limit-changes/:requestId/cancel')
  @ApiOperation({ summary: 'Withdraw your own pending proposal' })
  cancel(@CurrentUser() user: JwtPayload, @Param('requestId') requestId: string) {
    return this.limits.cancel(requestId, user.sub);
  }

  // ── Emergency controls ───────────────────────────────────────────────────

  @Get('emergency-controls')
  @ApiOperation({ summary: 'Every named kill switch and its current state' })
  listControls() {
    return this.emergency.list();
  }

  @Post('emergency-controls/:key')
  @ApiOperation({ summary: 'Activate or deactivate a named kill switch' })
  setControl(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: EmergencyControlKey,
    @Body() dto: SetEmergencyControlDto,
  ) {
    return this.emergency.set(key, dto.isActive, dto.reason, user.sub);
  }
}
