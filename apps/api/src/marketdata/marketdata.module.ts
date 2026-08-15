import { Module } from '@nestjs/common';
import { CandleRepository } from './candle.repository';
import { DataQualityService } from './data-quality.service';
import { IngestionService } from './ingestion.service';
import { AdminMarketDataController } from './admin-marketdata.controller';
import { ProviderRegistryService } from './provider-registry.service';

/**
 * The point-in-time market data platform (docs/17, roadmap MVP32).
 *
 * Exports the repository and the quality gate rather than the raw Prisma models, so every
 * downstream consumer is forced through `asOf`-filtered reads. That is the module's actual
 * contract: not "here is market data" but "here is market data you could have known".
 */
@Module({
  controllers: [AdminMarketDataController],
  providers: [ProviderRegistryService, CandleRepository, DataQualityService, IngestionService],
  exports: [CandleRepository, DataQualityService, IngestionService, ProviderRegistryService],
})
export class MarketDataModule {}
