import { Injectable, Logger } from '@nestjs/common';
import { DataProviderTier, Prisma } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { CoinbaseOhlcvProvider } from './providers/coinbase.ohlcv-provider';
import { OkxOhlcvProvider } from './providers/okx.ohlcv-provider';
import { OhlcvBar, OhlcvProvider, OhlcvQuery } from './ohlcv-provider.interface';

/** Beyond this, two venues are not quoting the same asset and one of them is wrong. */
export const DISAGREEMENT_TOLERANCE_BPS = 200;

/**
 * How fast a score moves. Deliberately asymmetric: a provider that just dropped an hour of data
 * has not earned its old score back by answering the next request correctly.
 */
const ALPHA_UP = 0.05;
const ALPHA_DOWN = 0.35;

export interface FetchOutcome {
  bars: OhlcvBar[];
  source: string;
  /** Providers that answered and were compared. */
  corroboratedBy: string[];
  /** Providers whose latest close differed beyond tolerance. */
  disagreedWith: Array<{ provider: string; deviationBps: number }>;
}

/**
 * Resolves OHLCV through a tiered provider chain, and — the part that matters — **measures** how
 * good each provider is instead of trusting a number somebody typed into config.
 *
 * The disagreement rule is the one worth reading twice. When two venues report the same bar and
 * their closes differ beyond tolerance, the values are **not averaged**. Averaging produces a
 * number that is wrong in a new way and, worse, hides the fact that anything was wrong at all —
 * and a venue printing a bad price is precisely the event a data platform exists to catch. So
 * the primary's value is used, the disagreement is counted against both, and the quality score
 * for that symbol falls, which flows through the gate to NO TRADE.
 */
@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers: OhlcvProvider[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {
    // Order is the tier order. Endpoints come from config so a test can point one provider at a
    // dead host and observe the registry degrade for real, rather than mocking the degradation.
    this.providers = [
      new OkxOhlcvProvider(this.config.okxBaseUrl),
      new CoinbaseOhlcvProvider(this.config.coinbaseBaseUrl),
    ];
  }

  listProviders(): ReadonlyArray<{ key: string; tier: string }> {
    return this.providers.map((p) => ({ key: p.key, tier: p.tier }));
  }

  /**
   * Asks every provider that supports the pair, uses the highest-tier answer, and records what
   * the others said about it.
   *
   * Returns `null` when nothing answered. Not an empty array — an empty array reads as "there
   * were no bars", which is a different and much more dangerous claim than "nobody could tell
   * me".
   */
  async fetchOhlcv(query: OhlcvQuery): Promise<FetchOutcome | null> {
    const answers: Array<{ provider: OhlcvProvider; bars: OhlcvBar[] }> = [];

    for (const provider of this.providers) {
      if (!provider.supports(query.symbol)) continue;

      const startedAt = Date.now();
      let bars: OhlcvBar[] | null = null;
      let error: string | null = null;

      try {
        bars = await provider.fetchOhlcv(query);
      } catch (err) {
        // A provider is contractually supposed to return null rather than throw. One that
        // throws anyway is a provider having a worse day than it admits, and it counts as a
        // failure rather than taking the whole fetch down.
        error = err instanceof Error ? err.message : String(err);
      }

      const latencyMs = Date.now() - startedAt;

      if (bars && bars.length > 0) {
        answers.push({ provider, bars });
        await this.recordSuccess(provider, query.symbol, latencyMs);
      } else {
        await this.recordFailure(provider, query.symbol, error ?? 'no data returned', latencyMs);
      }
    }

    if (answers.length === 0) return null;

    // Highest tier wins. PRIMARY's value is used even when a SECONDARY also answered — a
    // corroborating source corroborates; it does not vote.
    const rank: Record<string, number> = { PRIMARY: 0, SECONDARY: 1, REFERENCE: 2 };
    answers.sort((a, b) => rank[a.provider.tier] - rank[b.provider.tier]);
    const chosen = answers[0];

    const corroboratedBy: string[] = [];
    const disagreedWith: Array<{ provider: string; deviationBps: number }> = [];

    for (const other of answers.slice(1)) {
      const deviation = this.compareLatestClose(chosen.bars, other.bars);
      if (deviation === null) continue;

      corroboratedBy.push(other.provider.key);
      if (deviation > DISAGREEMENT_TOLERANCE_BPS) {
        disagreedWith.push({ provider: other.provider.key, deviationBps: deviation });
        await this.recordDisagreement(chosen.provider, query.symbol);
        await this.recordDisagreement(other.provider, query.symbol);
        this.logger.warn(
          `Provider disagreement on ${query.symbol} ${query.timeframe}: ` +
            `${chosen.provider.key} vs ${other.provider.key} differ by ${deviation} bps.`,
        );
      }
    }

    return { bars: chosen.bars, source: chosen.provider.key, corroboratedBy, disagreedWith };
  }

  /**
   * Deviation in basis points between two providers' most recent **common** bar.
   *
   * Comparing the last element of each list would be wrong: providers can be one bar apart at a
   * boundary, and comparing adjacent bars during a fast move manufactures a disagreement that is
   * really just a timing difference. Returns null when there is no overlapping bar to compare.
   */
  private compareLatestClose(a: OhlcvBar[], b: OhlcvBar[]): number | null {
    const byTime = new Map(b.map((bar) => [bar.openTime.getTime(), bar]));
    for (let i = a.length - 1; i >= 0; i--) {
      const other = byTime.get(a[i].openTime.getTime());
      if (!other) continue;

      const left = a[i].close;
      const right = other.close;
      if (left.isZero() || right.isZero()) return null;

      return Number(left.minus(right).abs().dividedBy(left).times(10_000).toFixed(2));
    }
    return null;
  }

  // ── Scoring ─────────────────────────────────────────────────────────────

  /**
   * The score is an exponentially-weighted success rate, penalised by disagreements.
   *
   * Written as an upsert per (provider, category, symbol) *and* a provider-wide row, because a
   * source can be excellent for BTC and useless for a mid-cap — a single global number would
   * average those into a figure that describes neither.
   */
  private async updateScore(
    provider: OhlcvProvider,
    symbol: string,
    mutate: (current: ScoreState) => ScoreState,
  ): Promise<void> {
    for (const scope of [symbol, null]) {
      const where = {
        providerKey: provider.key,
        category: 'ohlcv',
        symbol: scope,
      };

      const existing = await this.prisma.dataProviderStatus.findFirst({ where });
      const current: ScoreState = existing
        ? {
            reliability: Number(existing.reliability),
            successCount: existing.successCount,
            failureCount: existing.failureCount,
            gapCount: existing.gapCount,
            disagreementCount: existing.disagreementCount,
            lastLatencyMs: existing.lastLatencyMs,
            lastSuccessAt: existing.lastSuccessAt,
            lastFailureAt: existing.lastFailureAt,
            lastError: existing.lastError,
          }
        : {
            reliability: 0,
            successCount: 0,
            failureCount: 0,
            gapCount: 0,
            disagreementCount: 0,
            lastLatencyMs: null,
            lastSuccessAt: null,
            lastFailureAt: null,
            lastError: null,
          };

      const next = mutate(current);
      const data = {
        tier: provider.tier as DataProviderTier,
        reliability: new Prisma.Decimal(Math.max(0, Math.min(1, next.reliability)).toFixed(4)),
        successCount: next.successCount,
        failureCount: next.failureCount,
        gapCount: next.gapCount,
        disagreementCount: next.disagreementCount,
        lastLatencyMs: next.lastLatencyMs,
        lastSuccessAt: next.lastSuccessAt,
        lastFailureAt: next.lastFailureAt,
        lastError: next.lastError,
      };

      if (existing) {
        await this.prisma.dataProviderStatus.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.dataProviderStatus.create({ data: { ...where, ...data } });
      }
    }
  }

  private recordSuccess(provider: OhlcvProvider, symbol: string, latencyMs: number) {
    return this.updateScore(provider, symbol, (c) => ({
      ...c,
      reliability: c.reliability + ALPHA_UP * (1 - c.reliability),
      successCount: c.successCount + 1,
      lastLatencyMs: latencyMs,
      lastSuccessAt: new Date(),
    }));
  }

  private recordFailure(provider: OhlcvProvider, symbol: string, error: string, latencyMs: number) {
    return this.updateScore(provider, symbol, (c) => ({
      ...c,
      reliability: c.reliability * (1 - ALPHA_DOWN),
      failureCount: c.failureCount + 1,
      lastLatencyMs: latencyMs,
      lastFailureAt: new Date(),
      lastError: error.slice(0, 500),
    }));
  }

  private recordDisagreement(provider: OhlcvProvider, symbol: string) {
    return this.updateScore(provider, symbol, (c) => ({
      ...c,
      // Half the penalty of an outright failure: a disagreement means one of the two is wrong
      // and we do not yet know which. Penalising both fully would punish the correct one as
      // hard as the broken one.
      reliability: c.reliability * (1 - ALPHA_DOWN / 2),
      disagreementCount: c.disagreementCount + 1,
    }));
  }

  async reliabilityOf(providerKey: string, symbol: string | null): Promise<number> {
    const row = await this.prisma.dataProviderStatus.findFirst({
      where: { providerKey, category: 'ohlcv', symbol },
    });
    return row ? Number(row.reliability) : 0;
  }
}

interface ScoreState {
  reliability: number;
  successCount: number;
  failureCount: number;
  gapCount: number;
  disagreementCount: number;
  lastLatencyMs: number | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
}
