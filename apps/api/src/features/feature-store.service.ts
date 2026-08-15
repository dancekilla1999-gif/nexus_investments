import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { Timeframe } from '../marketdata/ohlcv-provider.interface';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  FeatureEngineService,
  FeatureVector,
  deserialiseValues,
  hashValues,
  serialiseValues,
} from './feature-engine.service';

export interface SkewCheck {
  symbol: string;
  timeframe: string;
  asOf: Date;
  matched: boolean;
  recordedHash: string;
  recomputedHash: string;
  /** Populated only on mismatch: which columns differ, and by how much. */
  differences: Array<{ feature: string; recorded: number | null; recomputed: number | null }>;
}

/**
 * Online and offline feature stores, and the check that keeps them honest (docs/17 §3.4).
 *
 * The online store is Redis, warm enough that inference needs no database round trip. The offline
 * store is `feature_vectors`, append-only, and it is the record the skew check compares against.
 *
 * `verifyNoSkew` is the milestone's acceptance test made into a runnable production check rather
 * than a one-off. It recomputes a recorded instant and compares digests; a mismatch means the
 * backtest and the live path have diverged, every model trained on the offline version is being
 * scored on a distribution it never saw, and that is an incident rather than a rounding
 * difference.
 */
@Injectable()
export class FeatureStoreService {
  private readonly logger = new Logger(FeatureStoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: FeatureEngineService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private onlineKey(symbol: string, timeframe: string): string {
    return `features:${symbol}:${timeframe}`;
  }

  /**
   * Records a vector to both stores.
   *
   * The offline write is `skipDuplicates`-shaped: recomputing the same instant under the same
   * contract must not create a second row. If the value differed, that is exactly the skew this
   * table exists to detect, and it should surface through `verifyNoSkew` rather than as two rows
   * nobody compares.
   */
  async record(vector: FeatureVector, onlineTtlSeconds = 3600): Promise<{ stored: boolean }> {
    const existing = await this.prisma.featureVectorRecord.findUnique({
      where: {
        symbol_timeframe_asOf_featureSetVersion: {
          symbol: vector.symbol,
          timeframe: vector.timeframe,
          asOf: vector.asOf,
          featureSetVersion: vector.featureSetVersion,
        },
      },
    });

    let stored = false;
    if (!existing) {
      await this.prisma.featureVectorRecord.create({
        data: {
          symbol: vector.symbol,
          timeframe: vector.timeframe,
          asOf: vector.asOf,
          barOpenTime: vector.barOpenTime,
          featureSetVersion: vector.featureSetVersion,
          contextTimeframes: vector.contextTimeframes,
          values: serialiseValues(vector.values) as unknown as Prisma.InputJsonValue,
          missing: vector.missing,
          hash: vector.hash,
        },
      });
      stored = true;
    } else if (existing.hash !== vector.hash) {
      // Do not overwrite and do not throw: the recorded value is the historical fact, and the
      // disagreement is the finding. Loud, because a silent one defeats the whole mechanism.
      this.logger.error(
        `Feature skew on ${vector.symbol} ${vector.timeframe} @ ${vector.asOf.toISOString()}: ` +
          `recorded ${existing.hash.slice(0, 12)}, recomputed ${vector.hash.slice(0, 12)}.`,
      );
    }

    await this.redis.set(
      this.onlineKey(vector.symbol, vector.timeframe),
      JSON.stringify({
        asOf: vector.asOf.toISOString(),
        barOpenTime: vector.barOpenTime.toISOString(),
        featureSetVersion: vector.featureSetVersion,
        contextTimeframes: vector.contextTimeframes,
        values: serialiseValues(vector.values),
        missing: vector.missing,
        hash: vector.hash,
      }),
      'EX',
      onlineTtlSeconds,
    );

    return { stored };
  }

  /** The newest vector for a pair, from the online store. */
  async online(symbol: string, timeframe: Timeframe): Promise<FeatureVector | null> {
    const raw = await this.redis.get(this.onlineKey(symbol, timeframe));
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as {
        asOf: string;
        barOpenTime: string;
        featureSetVersion: string;
        contextTimeframes: Timeframe[];
        values: Record<string, string>;
        missing: string[];
        hash: string;
      };
      return {
        symbol,
        timeframe,
        asOf: new Date(p.asOf),
        barOpenTime: new Date(p.barOpenTime),
        featureSetVersion: p.featureSetVersion,
        contextTimeframes: p.contextTimeframes ?? [],
        values: deserialiseValues(p.values),
        missing: p.missing,
        hash: p.hash,
      };
    } catch {
      return null;
    }
  }

  /**
   * Recomputes a recorded instant and compares it, column by column.
   *
   * Uses `skipQualityGate` deliberately. The gate's verdict depends on when it runs — a window
   * that was fresh at the time is stale from today's perspective — so applying it here would make
   * the check fail for a reason that has nothing to do with skew. What is being tested is whether
   * the *arithmetic* over identical inputs produces an identical answer, and the inputs are
   * identical by construction because the read is `asOf`-filtered.
   */
  async verifyNoSkew(recordId: string): Promise<SkewCheck> {
    const record = await this.prisma.featureVectorRecord.findUniqueOrThrow({ where: { id: recordId } });

    // Replay the recorded configuration exactly, contexts included. Falling back to the engine's
    // default context set is what made this check report skew on a vector that had not skewed.
    const { vector } = await this.engine.compute({
      symbol: record.symbol,
      timeframe: record.timeframe as Timeframe,
      asOf: record.asOf,
      contextTimeframes: record.contextTimeframes as Timeframe[],
      skipQualityGate: true,
    });

    const recomputed = vector?.values ?? {};
    const recordedValues = deserialiseValues(record.values as unknown as Record<string, string>);
    const recomputedHash = vector ? vector.hash : hashValues({});

    const differences: SkewCheck['differences'] = [];
    const allKeys = new Set([...Object.keys(recordedValues), ...Object.keys(recomputed)]);
    for (const key of [...allKeys].sort()) {
      const a = recordedValues[key] ?? null;
      const b = recomputed[key] ?? null;
      // Strict equality, not a tolerance. IEEE-754 arithmetic is exactly reproducible for the
      // same operations in the same order, so any difference at all means the operations changed
      // — and a tolerance would hide precisely the small, systematic drift worth catching.
      if (a !== b) differences.push({ feature: key, recorded: a, recomputed: b });
    }

    const matched = record.hash === recomputedHash && differences.length === 0;
    if (!matched) {
      this.logger.error(
        `Feature skew detected on ${record.symbol} ${record.timeframe} @ ` +
          `${record.asOf.toISOString()}: ${differences.length} column(s) differ.`,
      );
    }

    return {
      symbol: record.symbol,
      timeframe: record.timeframe,
      asOf: record.asOf,
      matched,
      recordedHash: record.hash,
      recomputedHash,
      differences: differences.slice(0, 50),
    };
  }

  /** Sweeps recent records. Runs as an operator check; a single mismatch is a finding. */
  async verifyRecent(limit = 20): Promise<{ checked: number; mismatched: SkewCheck[] }> {
    const records = await this.prisma.featureVectorRecord.findMany({
      orderBy: { computedAt: 'desc' },
      take: Math.min(limit, 200),
      select: { id: true },
    });

    const mismatched: SkewCheck[] = [];
    for (const r of records) {
      const check = await this.verifyNoSkew(r.id);
      if (!check.matched) mismatched.push(check);
    }
    return { checked: records.length, mismatched };
  }

  async recent(symbol: string, timeframe: Timeframe, limit = 50) {
    return this.prisma.featureVectorRecord.findMany({
      where: { symbol, timeframe },
      orderBy: { asOf: 'desc' },
      take: Math.min(limit, 500),
      select: {
        id: true,
        asOf: true,
        barOpenTime: true,
        featureSetVersion: true,
        missing: true,
        hash: true,
        computedAt: true,
      },
    });
  }
}
