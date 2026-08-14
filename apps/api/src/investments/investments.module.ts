import { Module } from '@nestjs/common';
import { NavModule } from '../nav/nav.module';
import { AdminInvestmentsController } from './admin-investments.controller';
import { AllocationService } from './allocation.service';
import { DealingService } from './dealing.service';
import { InvestmentsController } from './investments.controller';
import { InvestmentStrategiesService } from './investment-strategies.service';
import { MyInvestmentsController } from './my-investments.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [NavModule],
  controllers: [InvestmentsController, MyInvestmentsController, AdminInvestmentsController],
  providers: [InvestmentStrategiesService, SubscriptionsService, DealingService, AllocationService],
  exports: [InvestmentStrategiesService, SubscriptionsService, DealingService, AllocationService],
})
export class InvestmentsModule {}
