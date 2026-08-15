import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { CandleRepository } from './candle.repository';
import { ProviderRegistryService } from './provider-registry.service';
import { TIMEFRAMES, Timeframe } from './ohlcv-provider.interface';

export interface IngestResult {
  symbol: string;
  timeframe: Timeframe;
  source: string | null;
  inserted: number;
  corroboratedBy: string[];
  disagreedWith: Array<{ provider: string; deviationBps: number }>;
}

/**
 * Pulls closed bars and stores them with the instant we learned them.
 *
 * The service does no interpretation whatsoever — no indicators, no cleaning, no filling. Raw
 * observations in, raw observations stored. Everything derived is computed downstream by the
 * feature layer from what is in this table, which is what makes "replay history and reproduce
 * what the live system saw" a meaningful test: if ingestion massaged the data on the way in,
 * replay would reproduce the massage rather than the market.
 *
 * Backfill and live ingestion are the same code path for the same reason.
 */
@Injectable()
export class IngestionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly candles: CandleRepository,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.marketDataIngestionEnabled) {
      this.logger.log('Scheduled market-data ingestion disabled by configuration.');
      return;
    }
    const interval = this.config.marketDataIngestionIntervalMs;
    this.timer = setInterval(() => void this.ingestAll(), interval);
    this.timer.unref?.();
    this.logger.log(`Market-data ingestion started (every ${interval}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get symbols(): string[] {
    return this.config.marketDataSymbols;
  }

  get timeframes(): Timeframe[] {
    return this.config.marketDataTimeframes.filter((t): t is Timeframe =>
      (TIMEFRAMES as readonly string[]).includes(t),
    );
  }

  /**
   * One (symbol, timeframe) pull.
   *
   * `ingestTime` is stamped **once**, here, and applied to every bar in the batch — not
   * per-row inside the loop. Two bars fetched in the same call became knowable at the same
   * instant, and letting the clock drift across a batch would make a point-in-time query at a
   * boundary return some of a response but not all of it.
   */
  async ingest(symbol: string, timeframe: Timeframe, limit = 300): Promise<IngestResult> {
    const outcome = await this.registry.fetchOhlcv({ symbol, timeframe, limit });

    if (!outcome) {
      this.logger.warn(`No provider could supply ${symbol} ${timeframe}.`);
      return { symbol, timeframe, source: null, inserted: 0, corroboratedBy: [], disagreedWith: [] };
    }

    const inserted = await this.candles.insertMany({
      source: outcome.source,
      symbol,
      timeframe,
      bars: outcome.bars,
      ingestTime: new Date(),
    });

    return {
      symbol,
      timeframe,
      source: outcome.source,
      inserted,
      corroboratedBy: outcome.corroboratedBy,
      disagreedWith: outcome.disagreedWith,
    };
  }

  /**
   * Every configured pair and timeframe.
   *
   * One failing symbol must not stop the rest, and the failure has to be visible — an ingestion
   * loop that quietly skips a pair produces a gap, and a gap is the failure mode the quality
   * gate is least able to distinguish from a genuinely quiet market.
   */
  async ingestAll(): Promise<{ pulled: number; inserted: number; failed: number }> {
    if (this.running) return { pulled: 0, inserted: 0, failed: 0 };
    this.running = true;

    try {
      let pulled = 0;
      let inserted = 0;
      let failed = 0;

      for (const symbol of this.symbols) {
        for (const timeframe of this.timeframes) {
          try {
            const result = await this.ingest(symbol, timeframe);
            pulled++;
            inserted += result.inserted;
            if (result.source === null) failed++;
          } catch (err) {
            failed++;
            this.logger.error(
              `Ingestion failed for ${symbol} ${timeframe}: ` +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        }
      }

      return { pulled, inserted, failed };
    } finally {
      this.running = false;
    }
  }
}
