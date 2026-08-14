import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { BlockchainRegistry } from '../blockchain/blockchain.registry';
import { CustodyReconciliationService } from './custody-reconciliation.service';
import { DepositsService } from './deposits.service';

@ApiTags('deposits')
@Controller('wallet/deposits')
export class DepositsController {
  constructor(
    private readonly deposits: DepositsService,
    private readonly registry: BlockchainRegistry,
    private readonly reconciliation: CustodyReconciliationService,
  ) {}

  /** Chains this deployment can actually watch — not every chain in the database. */
  @Get('chains')
  async listDepositableChains() {
    return this.registry.getConfiguredChainKeys();
  }

  @Get()
  listMine(@CurrentUser() user: JwtPayload) {
    return this.deposits.listUserDeposits(user.sub);
  }

  @Post('address/:chainKey')
  getAddress(@CurrentUser() user: JwtPayload, @Param('chainKey') chainKey: string) {
    return this.deposits.getOrCreateDepositAddress(user.sub, chainKey);
  }

  /**
   * On-demand custody reconciliation. Restricted to risk operations: it exposes the platform's
   * aggregate holdings, which is not a user-facing number, and each run costs a balance read
   * per address per asset. The scheduled run (docs/06 §6) remains the primary path — this
   * exists so an operator responding to an incident does not have to wait for the next tick.
   */
  @Post('reconcile')
  @Roles(UserRole.RISK_OPS, UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Compare ledger obligations against on-chain custody (risk ops)' })
  runReconciliation() {
    return this.reconciliation.runAll();
  }
}
