import { Module } from '@nestjs/common';
import { AdminInvestmentsController } from './admin-investments.controller';
import { InvestmentsController } from './investments.controller';
import { InvestmentStrategiesService } from './investment-strategies.service';

@Module({
  controllers: [InvestmentsController, AdminInvestmentsController],
  providers: [InvestmentStrategiesService],
  exports: [InvestmentStrategiesService],
})
export class InvestmentsModule {}
