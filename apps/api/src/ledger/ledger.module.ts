import { Global, Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';

/**
 * Global: every module that moves value (wallet, trading, p2p, fees, referrals) posts through
 * this one service, and none of them should have to import a ledger module to do it — there
 * is exactly one ledger.
 */
@Global()
@Module({
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
