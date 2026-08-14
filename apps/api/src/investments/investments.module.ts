import { Module } from '@nestjs/common';
import { AdminInvestmentsController } from './admin-investments.controller';
import { DealingService } from './dealing.service';
import { InvestmentsController } from './investments.controller';
import { InvestmentStrategiesService } from './investment-strategies.service';
import { MyInvestmentsController } from './my-investments.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [InvestmentsController, MyInvestmentsController, AdminInvestmentsController],
  providers: [InvestmentStrategiesService, SubscriptionsService, DealingService],
  exports: [InvestmentStrategiesService, SubscriptionsService, DealingService],
})
export class InvestmentsModule {}
