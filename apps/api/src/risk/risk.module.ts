import { Module } from '@nestjs/common';
import { NavModule } from '../nav/nav.module';
import { EmergencyControlsService } from './emergency-controls.service';
import { RiskController } from './risk.controller';
import { RiskEngineService } from './risk-engine.service';
import { RiskLimitsService } from './risk-limits.service';

@Module({
  imports: [NavModule],
  controllers: [RiskController],
  providers: [RiskEngineService, RiskLimitsService, EmergencyControlsService],
  exports: [RiskEngineService, RiskLimitsService, EmergencyControlsService],
})
export class RiskModule {}
