import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OhlcvBar, Timeframe } from './ohlcv-provider.interface';

export interface StoredCandle extends OhlcvBar {
  source: string;
  symbol: string;
  timeframe: string;
  ingestTime: Date;
}

/**
 * The only way anything reads candles.
 *
 * Every method takes `asOf` and filters on **`ingestTime`**, never on `openTime` or `closeTime`.
 * That is the whole reason this class exists rather than callers using Prisma directly: a
 * developer writing `where: { closeTime: { lte: t } }` has written a lookahead bug that will
 * produce a beautiful backtest and no live edge, and it will pass code review because it looks
 * obviously correct. Routing every read through one method with no event-time filter available
 * makes that mistake require deliberate effort.
 *
 * `asOf` is mandatory on the historical path. There is no default of `now`, because a default
 * is what turns "I forgot" into "it silently worked in development".
 */
@Injectable()
export class CandleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bars for (symbol, timeframe) that were **knowable** at `asOf`, oldest first.
   *
   * Note there is no `closeTime <= asOf` clause and none is needed: the database CHECK
   * guarantees `ingestTime >= closeTime`, so filtering on ingest time already excludes anything
   * that had not closed. The invariant is enforced once, at write time, rather than being
   * re-asserted at every read site where it could be forgotten.
   */
  async knowableAt(params: {
    symbol: string;
    timeframe: Timeframe;
    asOf: Date;
    limit: number;
    source?: string;
  }): Promise<StoredCandle[]> {
    const rows = await this.prisma.marketCandle.findMany({
      where: {
        symbol: params.symbol,
        timeframe: params.timeframe,
        ingestTime: { lte: params.asOf },
        ...(params.source ? { source: params.source } : {}),
      },
      orderBy: { openTime: 'desc' },
      take: params.limit,
    });

    return rows.reverse().map(toStored);
  }

  /** The most recent knowable bar, or null. */
  async latestKnowableAt(params: {
    symbol: string;
    timeframe: Timeframe;
    asOf: Date;
    source?: string;
  }): Promise<StoredCandle | null> {
    const [bar] = await this.knowableAt({ ...params, limit: 1 });
    return bar ?? null;
  }

  /**
   * Inserts bars, skipping any that already exist.
   *
   * `skipDuplicates` rather than an upsert, deliberately. `market_candles` is append-only at the
   * database level — the trigger rejects UPDATE outright — because a bar a model has already
   * trained on must not change underneath it. A provider re-reporting a bar differently is a new
   * observation to investigate, not a correction to apply.
   *
   * Returns how many rows were actually new, which is what the ingestion loop logs and what the
   * gap detector reasons about.
   */
  async insertMany(params: {
    source: string;
    symbol: string;
    timeframe: Timeframe;
    bars: OhlcvBar[];
    ingestTime?: Date;
    /**
     * How to stamp `ingestTime` — when the platform is treated as having learned each bar.
     *
     * `'now'` (the default) is correct for live polling: we learned the bar when we fetched it.
     *
     * `'bar-close'` stamps each bar with its own close, asserting it was knowable the moment it
     * closed. **Valid only for sources that do not revise history**, which exchange OHLCV does
     * not — a closed spot candle from two weeks ago is the same candle whether it was fetched
     * then or now. It is emphatically NOT valid for macro releases or on-chain flow data, both
     * of which are revised and back-filled; using it there would recreate exactly the leak
     * `macro_observations`' vintages exist to prevent.
     *
     * This exists because a backfill stamped `'now'` is invisible to every historical query — the
     * point-in-time filter correctly reports that nothing was knowable back then — so a research
     * dataset built from fresh history comes back empty. Found by a live e2e test doing precisely
     * that. The choice is explicit rather than inferred, because the wrong answer is silent.
     */
    ingestTimePolicy?: 'now' | 'bar-close';
  }): Promise<number> {
    if (params.bars.length === 0) return 0;

    const policy = params.ingestTimePolicy ?? 'now';
    const ingestTime = params.ingestTime ?? new Date();

    const data: Prisma.MarketCandleCreateManyInput[] = params.bars
      // A bar that has not closed as of the ingest instant would violate the CHECK. Filtering
      // here turns a provider bug into a skipped row and a warning rather than a failed batch
      // that also loses the good bars alongside it.
      .filter((bar) => bar.closeTime <= ingestTime)
      .map((bar) => ({
        source: params.source,
        symbol: params.symbol,
        timeframe: params.timeframe,
        openTime: bar.openTime,
        closeTime: bar.closeTime,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        trades: bar.trades,
        ingestTime: policy === 'bar-close' ? bar.closeTime : ingestTime,
      }));

    if (data.length === 0) return 0;

    const result = await this.prisma.marketCandle.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  /** Distinct (symbol, timeframe, source) triples present in the store. */
  async coverage(): Promise<Array<{ symbol: string; timeframe: string; source: string; bars: number }>> {
    const rows = await this.prisma.marketCandle.groupBy({
      by: ['symbol', 'timeframe', 'source'],
      _count: { _all: true },
      orderBy: [{ symbol: 'asc' }, { timeframe: 'asc' }, { source: 'asc' }],
    });
    return rows.map((r) => ({
      symbol: r.symbol,
      timeframe: r.timeframe,
      source: r.source,
      bars: r._count._all,
    }));
  }
}

function toStored(row: {
  source: string;
  symbol: string;
  timeframe: string;
  openTime: Date;
  closeTime: Date;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
  trades: number | null;
  ingestTime: Date;
}): StoredCandle {
  return {
    source: row.source,
    symbol: row.symbol,
    timeframe: row.timeframe,
    openTime: row.openTime,
    closeTime: row.closeTime,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    trades: row.trades,
    ingestTime: row.ingestTime,
  };
}
