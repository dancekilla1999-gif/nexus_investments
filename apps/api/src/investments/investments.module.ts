import { Module } from '@nestjs/common';
import { NavModule } from '../nav/nav.module';
import { RiskModule } from '../risk/risk.module';
import { AdminInvestmentsController } from './admin-investments.controller';
import { AllocationService } from './allocation.service';
import { DealingService } from './dealing.service';
import { FeesService } from './fees.service';
import { InvestmentsController } from './investments.controller';
import { InvestmentStrategiesService } from './investment-strategies.service';
import { ManagerTradingController } from './manager-trading.controller';
import { MyInvestmentsController } from './my-investments.controller';
import { StrategyAssignmentsService } from './strategy-assignments.service';
import { SubscriptionsService } from './subscriptions.service';
import { TradingService } from './trading.service';

@Module({
  imports: [NavModule, RiskModule],
  controllers: [
    InvestmentsController,
    MyInvestmentsController,
    AdminInvestmentsController,
    ManagerTradingController,
  ],
  providers: [
    InvestmentStrategiesService,
    SubscriptionsService,
    DealingService,
    AllocationService,
    FeesService,
    StrategyAssignmentsService,
    TradingService,
  ],
  exports: [
    InvestmentStrategiesService,
    SubscriptionsService,
    DealingService,
    AllocationService,
    FeesService,
    StrategyAssignmentsService,
    TradingService,
  ],
})
export class InvestmentsModule {}
