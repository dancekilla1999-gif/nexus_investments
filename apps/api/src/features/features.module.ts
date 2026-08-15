import { Module } from '@nestjs/common';
import { MarketDataModule } from '../marketdata/marketdata.module';
import { AdminFeaturesController } from './admin-features.controller';
import { FeatureEngineService } from './feature-engine.service';
import { FeatureStoreService } from './feature-store.service';

/**
 * The feature layer (docs/17 §3, roadmap MVP33).
 *
 * Exports the engine and the store, and nothing else. In particular it does not export the
 * kernels: a caller reaching past the engine to compute an indicator directly would be building
 * the second implementation this module exists to prevent.
 */
@Module({
  imports: [MarketDataModule],
  controllers: [AdminFeaturesController],
  providers: [FeatureEngineService, FeatureStoreService],
  exports: [FeatureEngineService, FeatureStoreService],
})
export class FeaturesModule {}
