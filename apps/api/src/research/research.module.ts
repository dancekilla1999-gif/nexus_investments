import { Module } from '@nestjs/common';
import { FeaturesModule } from '../features/features.module';
import { MarketDataModule } from '../marketdata/marketdata.module';
import { AdminResearchController } from './admin-research.controller';
import { ResearchService } from './research.service';

/**
 * The research harness (docs/18 §3, roadmap MVP34).
 *
 * Operator-only. It cannot write to the production model registry and it has no path to capital;
 * the most it can do is submit a promotion request (docs/18 §7). What it *does* own is the trial
 * counter, which is why the counting lives here rather than in whatever calls it.
 */
@Module({
  imports: [MarketDataModule, FeaturesModule],
  controllers: [AdminResearchController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
