import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditActorType,
  InvestmentStrategy,
  Prisma,
  StrategyCustodyModel,
  StrategyStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { formatAmount } from '../ledger/amount.util';
import { PrismaService } from '../prisma/prisma.service';
import { collectForbiddenClaims } from './forbidden-claims';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';

/**
 * Investment products: creation, configuration, and the gates that decide whether a strategy
 * may take a single dollar of anyone's money (docs/12 §3).
 *
 * Two gates are non-negotiable, and both are enforced here *and* by database constraints:
 *
 *   1. No strategy reaches OPEN without a passing backtest (docs/11). A strategy that has not
 *      been tested on history cannot take capital.
 *   2. No strategy may be configured above a 10% max drawdown — load-bearing under the
 *      platform's 50% profit share, because the manager takes half the upside and none of the
 *      downside (docs/12 §6.0).
 *
 * The service exists to give a useful error message. The constraint exists to make the rule
 * true regardless of which code path writes.
 */
@Injectable()
export class InvestmentStrategiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Investor-facing ─────────────────────────────────────────────────────

  /**
   * The marketplace. Only strategies actually taking or holding money — a DRAFT is an internal
   * work-in-progress and showing it would advertise a product that cannot be bought.
   */
  async listMarketplace() {
    const strategies = await this.prisma.investmentStrategy.findMany({
      where: { status: { in: [StrategyStatus.OPEN, StrategyStatus.SOFT_CLOSED] } },
      include: { baseAsset: true },
      orderBy: { createdAt: 'asc' },
    });

    return Promise.all(strategies.map((s) => this.toPublicView(s)));
  }

  async getBySlug(slug: string) {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { slug },
      include: { baseAsset: true },
    });
    if (!strategy || strategy.status === StrategyStatus.DRAFT) {
      // A DRAFT is indistinguishable from "does not exist" to anyone outside the desk.
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }
    return this.toPublicView(strategy);
  }

  // ── Manager-facing ──────────────────────────────────────────────────────

  async create(actorId: string, dto: CreateStrategyDto) {
    if (dto.custodyModel && dto.custodyModel !== StrategyCustodyModel.POOLED_NAV) {
      // Declared in the schema for jurisdictions that forbid pooling, but not built. Refusing
      // is the honest response; creating one would produce a strategy whose accounting silently
      // does not exist (docs/12 §0.2).
      throw new BadRequestException({
        code: 'CUSTODY_MODEL_NOT_IMPLEMENTED',
        message:
          'Only POOLED_NAV is implemented. SEGREGATED_COPY is a declared variant with no accounting behind it yet.',
      });
    }

    this.assertNoForbiddenClaims(dto);
    this.assertRiskLimits(dto);

    const asset = await this.prisma.asset.findUnique({ where: { id: dto.baseAssetId } });
    if (!asset || !asset.isEnabled) {
      throw new BadRequestException({
        code: 'INVALID_BASE_ASSET',
        message: 'The base asset must exist and be enabled.',
      });
    }

    const existing = await this.prisma.investmentStrategy.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new BadRequestException({ code: 'SLUG_TAKEN', message: 'That slug is already in use.' });
    }

    const strategy = await this.prisma.investmentStrategy.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        thesis: dto.thesis,
        baseAssetId: dto.baseAssetId,
        minimumInvestment: dto.minimumInvestment,
        maximumInvestment: dto.maximumInvestment,
        lockupDays: dto.lockupDays ?? 0,
        redemptionNoticeDays: dto.redemptionNoticeDays ?? 0,
        dealingFrequency: dto.dealingFrequency,
        mgmtFeeBps: dto.mgmtFeeBps ?? 0,
        perfFeeBps: dto.perfFeeBps ?? 5000,
        maxDrawdownBps: dto.maxDrawdownBps ?? 1000,
        benchmarkSymbol: dto.benchmarkSymbol,
        status: StrategyStatus.DRAFT,
      },
      include: { baseAsset: true },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'investment.strategy_created',
      entityType: 'InvestmentStrategy',
      entityId: strategy.id,
      metadata: { slug: strategy.slug, perfFeeBps: strategy.perfFeeBps, mgmtFeeBps: strategy.mgmtFeeBps },
    });

    return this.toManagerView(strategy);
  }

  async update(actorId: string, id: string, dto: UpdateStrategyDto) {
    const strategy = await this.requireStrategy(id);

    // Economic terms are what an investor decided on. Changing them under an existing investor
    // is a different act from configuring a draft, and it needs its own consented flow rather
    // than a silent edit — so once capital is in, the terms are frozen here.
    const hasInvestors = (await this.prisma.investmentPosition.count({ where: { strategyId: id } })) > 0;
    if (hasInvestors && this.touchesEconomicTerms(dto)) {
      throw new ForbiddenException({
        code: 'TERMS_LOCKED',
        message:
          'Fees, lock-up and risk limits cannot be changed while investors hold this strategy. Those terms are what they subscribed to.',
      });
    }

    this.assertNoForbiddenClaims({ ...strategy, ...dto });
    this.assertRiskLimits({ ...strategy, ...dto });

    const updated = await this.prisma.investmentStrategy.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        thesis: dto.thesis,
        minimumInvestment: dto.minimumInvestment,
        maximumInvestment: dto.maximumInvestment,
        lockupDays: dto.lockupDays,
        redemptionNoticeDays: dto.redemptionNoticeDays,
        dealingFrequency: dto.dealingFrequency,
        mgmtFeeBps: dto.mgmtFeeBps,
        perfFeeBps: dto.perfFeeBps,
        maxDrawdownBps: dto.maxDrawdownBps,
        benchmarkSymbol: dto.benchmarkSymbol,
        tradingStrategyId: dto.tradingStrategyId,
      },
      include: { baseAsset: true },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'investment.strategy_updated',
      entityType: 'InvestmentStrategy',
      entityId: id,
      metadata: { changed: Object.keys(dto) },
    });

    return this.toManagerView(updated);
  }

  /**
   * DRAFT/BACKTESTED → OPEN. The gate: a passing backtest must exist.
   *
   * "Passing" is not self-reported. It is a `BacktestResult` whose measured max drawdown is
   * within the strategy's own configured ceiling — a strategy cannot advertise a 10% limit on
   * the strength of a backtest that drew down 30%.
   */
  async open(actorId: string, id: string) {
    const strategy = await this.requireStrategy(id);

    if (strategy.status === StrategyStatus.OPEN) return this.toManagerView(strategy);

    // WINDING_DOWN and CLOSED are terminal: a strategy returning capital to its investors must
    // not start taking more. Reopening one means creating a new product.
    const openable: StrategyStatus[] = [
      StrategyStatus.DRAFT,
      StrategyStatus.BACKTESTED,
      StrategyStatus.SOFT_CLOSED,
      StrategyStatus.PAUSED,
    ];
    if (!openable.includes(strategy.status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `A ${strategy.status} strategy cannot be opened.`,
      });
    }

    const backtest = await this.findPassingBacktest(strategy);
    if (!backtest) {
      throw new ForbiddenException({
        code: 'BACKTEST_REQUIRED',
        message:
          'This strategy has no passing backtest. A strategy that has not been validated on history cannot take capital — see docs/11.',
      });
    }

    // Re-checked at the moment of opening, not only at creation: configuration may have moved
    // since, and this is the last point before real money is exposed to it.
    this.assertNoForbiddenClaims(strategy);
    this.assertRiskLimits(strategy);

    const opened = await this.prisma.investmentStrategy.update({
      where: { id },
      data: { status: StrategyStatus.OPEN, openedAt: strategy.openedAt ?? new Date() },
      include: { baseAsset: true },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'investment.strategy_opened',
      entityType: 'InvestmentStrategy',
      entityId: id,
      metadata: {
        backtestResultId: backtest.id,
        measuredMaxDrawdownBps: backtest.maxDrawdownBps,
        configuredMaxDrawdownBps: strategy.maxDrawdownBps,
      },
    });

    return this.toManagerView(opened);
  }

  async setStatus(actorId: string, id: string, status: StrategyStatus) {
    if (status === StrategyStatus.OPEN) {
      // Opening runs gates; it must not be reachable through a generic status setter.
      return this.open(actorId, id);
    }

    const strategy = await this.requireStrategy(id);
    const updated = await this.prisma.investmentStrategy.update({
      where: { id },
      data: { status, closedAt: status === StrategyStatus.CLOSED ? new Date() : strategy.closedAt },
      include: { baseAsset: true },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'investment.strategy_status_changed',
      entityType: 'InvestmentStrategy',
      entityId: id,
      metadata: { from: strategy.status, to: status },
    });

    return this.toManagerView(updated);
  }

  async listForManager() {
    const strategies = await this.prisma.investmentStrategy.findMany({
      include: { baseAsset: true },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(strategies.map((s) => this.toManagerView(s)));
  }

  // ── Gates ───────────────────────────────────────────────────────────────

  private async findPassingBacktest(strategy: InvestmentStrategy) {
    if (!strategy.tradingStrategyId) return null;

    const runs = await this.prisma.backtestRun.findMany({
      where: { strategyId: strategy.tradingStrategyId, status: 'COMPLETED' },
      include: { result: true },
      orderBy: { createdAt: 'desc' },
    });

    return (
      runs
        .map((run) => run.result)
        .find(
          (result): result is NonNullable<typeof result> =>
            result !== null &&
            // The backtest must clear the ceiling the strategy advertises, not merely exist.
            result.maxDrawdownBps <= strategy.maxDrawdownBps,
        ) ?? null
    );
  }

  private assertNoForbiddenClaims(fields: {
    name?: string | null;
    description?: string | null;
    thesis?: string | null;
  }) {
    const problems = collectForbiddenClaims({
      name: fields.name,
      description: fields.description,
      thesis: fields.thesis,
    });
    if (problems.length > 0) {
      throw new BadRequestException({
        code: 'FORBIDDEN_CLAIM',
        message:
          'This copy makes a claim the platform may not publish. Describe historical performance and risk instead of promising an outcome.',
        details: problems,
      });
    }
  }

  private assertRiskLimits(fields: { maxDrawdownBps?: number | null; perfFeeBps?: number | null; mgmtFeeBps?: number | null }) {
    const drawdown = fields.maxDrawdownBps ?? 1000;
    if (drawdown <= 0 || drawdown > 1000) {
      throw new BadRequestException({
        code: 'RISK_LIMIT_EXCEEDED',
        message:
          'maxDrawdownBps must be between 1 and 1000 (10%). The 10% ceiling is a hard platform limit — a strategy may set a stricter limit, never a looser one.',
      });
    }

    const perf = fields.perfFeeBps ?? 5000;
    if (perf < 0 || perf > 5000) {
      throw new BadRequestException({
        code: 'FEE_OUT_OF_RANGE',
        message: 'perfFeeBps must be between 0 and 5000 (50%).',
      });
    }

    const mgmt = fields.mgmtFeeBps ?? 0;
    if (mgmt < 0 || mgmt > 1000) {
      throw new BadRequestException({
        code: 'FEE_OUT_OF_RANGE',
        message: 'mgmtFeeBps must be between 0 and 1000 (10% annualised).',
      });
    }
  }

  private touchesEconomicTerms(dto: UpdateStrategyDto): boolean {
    return [
      dto.mgmtFeeBps,
      dto.perfFeeBps,
      dto.maxDrawdownBps,
      dto.lockupDays,
      dto.redemptionNoticeDays,
      dto.dealingFrequency,
      dto.minimumInvestment,
      dto.maximumInvestment,
    ].some((value) => value !== undefined);
  }

  private async requireStrategy(id: string) {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { id },
      include: { baseAsset: true },
    });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }
    return strategy;
  }

  // ── Views ───────────────────────────────────────────────────────────────

  private async toPublicView(strategy: InvestmentStrategy & { baseAsset: { symbol: string } }) {
    const latest = await this.prisma.navSnapshot.findFirst({
      where: { strategyId: strategy.id },
      orderBy: { struckAt: 'desc' },
    });
    const investorCount = await this.prisma.investmentPosition.count({
      where: { strategyId: strategy.id, units: { gt: 0 } },
    });

    return {
      slug: strategy.slug,
      name: strategy.name,
      description: strategy.description,
      thesis: strategy.thesis,
      status: strategy.status,
      baseAssetSymbol: strategy.baseAsset.symbol,

      // Terms an investor must see BEFORE an amount field exists (docs/12 §3).
      minimumInvestment: formatAmount(strategy.minimumInvestment),
      maximumInvestment: strategy.maximumInvestment ? formatAmount(strategy.maximumInvestment) : null,
      lockupDays: strategy.lockupDays,
      redemptionNoticeDays: strategy.redemptionNoticeDays,
      dealingFrequency: strategy.dealingFrequency,

      // Never hardcoded in the frontend — the fee an investor is quoted comes from here.
      mgmtFeeBps: strategy.mgmtFeeBps,
      perfFeeBps: strategy.perfFeeBps,
      maxDrawdownBps: strategy.maxDrawdownBps,
      benchmarkSymbol: strategy.benchmarkSymbol,

      // AUM and NAV are null until the NAV engine ships (MVP15). Null renders as "not yet
      // available"; a zero would read as a real measurement of an empty pool.
      aum: latest ? formatAmount(latest.poolNav) : null,
      navPerUnit: latest ? formatAmount(latest.navPerUnit) : null,
      navStruckAt: latest?.struckAt ?? null,
      investorCount,

      /**
       * Performance is deliberately absent rather than zero-filled. There is no track record
       * until the NAV engine has struck snapshots, and a chart of zeros is a fabricated one.
       */
      performance: null,
    };
  }

  private async toManagerView(strategy: InvestmentStrategy & { baseAsset: { symbol: string } }) {
    const publicView = await this.toPublicView(strategy);
    const backtest = await this.findPassingBacktest(strategy);

    return {
      ...publicView,
      id: strategy.id,
      custodyModel: strategy.custodyModel,
      tradingStrategyId: strategy.tradingStrategyId,
      totalUnits: formatAmount(strategy.totalUnits),
      createdAt: strategy.createdAt,
      openedAt: strategy.openedAt,
      closedAt: strategy.closedAt,
      /** Why the Open button is or is not available, computed server-side. */
      canOpen: backtest !== null,
      blockingReason: backtest === null ? 'No passing backtest for this strategy.' : null,
    };
  }
}

export type StrategyDecimalInput = Prisma.Decimal | string;
