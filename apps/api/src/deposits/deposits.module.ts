import { Module } from '@nestjs/common';
import { BlockchainRegistry } from '../blockchain/blockchain.registry';
import { CustodyReconciliationService } from './custody-reconciliation.service';
import { DepositWatcherService } from './deposit-watcher.service';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';

@Module({
  controllers: [DepositsController],
  providers: [
    BlockchainRegistry,
    DepositsService,
    DepositWatcherService,
    CustodyReconciliationService,
  ],
  exports: [
    BlockchainRegistry,
    DepositsService,
    DepositWatcherService,
    CustodyReconciliationService,
  ],
})
export class DepositsModule {}
