import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  LedgerAccountType,
  LedgerTransactionType,
  Prisma,
  StrategyOrder,
  StrategyOrderStatus,
  StrategyOrderType,
  StrategyStatus,
  UserRole,
} from '@prisma/client';
import { AuditActorType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { exactNeg, formatAmount, HighPrecision, quantize } from '../ledger/amount.util';
import { PLATFORM_SYSTEM_USER_ID } from '../ledger/ledger.constants';
import { LedgerService } from '../ledger/ledger.service';
import { NoMarkError, StaleMarkError, MarkRegistry } from '../nav/mark.registry';
import { NavService } from '../nav/nav.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlaceOrderDto } from './dto/place-order.dto';
import { StrategyAssignmentsService } from './strategy-assignments.service';

/** Strategy statuses a manager may still trade against. Matches the states with capital at risk. */
const TRADEABLE_STATUSES: ReadonlySet<StrategyStatus> = new Set([
  StrategyStatus.OPEN,
  StrategyStatus.SOFT_CLOSED,
]);

/**
 * The Manager Trading Terminal (MVP18, docs/09-roadmap.md): AUM overview, per-strategy positions
 * and exposure, and order placement for assigned traders/managers.
 *
 * No `ExecutionVenue` exists yet — that is MVP22 (docs/13). A fill here is therefore always a
 * *simulated* one, booked through `LedgerAccountType.SANDBOX_TRADE_EXECUTION` rather than the
 * real `EXTERNAL` custody boundary, and refused outright outside sandbox mode — the same
 * discipline `WalletService.faucet` already applies to testnet money, extended to trading
 * (docs/13 §6: "a sandbox fill is never presented as a real one").
 *
 * Both ledger legs of a fill stay inside the strategy's own STRATEGY_POOL plus the sandbox
 * contra-account: nothing here can name a destination account, a recipient, or a different
 * strategy's pool — the MVP18 acceptance criterion ("no endpoint that accepts an arbitrary
 * transfer") is a property of the DTO's shape, not a runtime check that could be bypassed.
 */
@Injectable()
export class TradingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TradingService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly nav: NavService,
    private readonly marks: MarkRegistry,
    private readonly config: AppConfigService,
    private readonly assignments: StrategyAssignmentsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.orderSweepEnabled) {
      this.logger.log('Scheduled order sweep disabled by configuration.');
      return;
    }
    const interval = this.config.orderSweepIntervalMs;
    this.timer = setInterval(() => void this.sweepPendingOrders(), interval);
    this.timer.unref?.();
    this.logger.log(`Order sweep started (every ${interval}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Read: AUM overview, positions/exposure ───────────────────────────────

  /** Every strategy the caller currently holds an active assignment on, with live AUM. */
  async overview(userId: string) {
    const strategyIds = await this.assignments.assignedStrategyIds(userId);
    const strategies = await this.prisma.investmentStrategy.findMany({
      where: { id: { in: strategyIds } },
      include: { baseAsset: true },
    });

    return Promise.all(
      strategies.map(async (strategy) => {
        const valuation = await this.nav.valuePool(strategy.id).catch((err) => {
          // A strategy with a holding nothing can currently price must not make the whole
          // overview 500 — surface the failure per-strategy instead (docs/12 §15: fail loudly,
          // but "loudly" here means visibly, not by taking down every other row with it).
          this.logger.warn(`AUM overview: ${strategy.slug} unpriceable — ${(err as Error).message}`);
          return null;
        });
        return {
          strategyId: strategy.id,
          slug: strategy.slug,
          name: strategy.name,
          status: strategy.status,
          baseAssetSymbol: strategy.baseAsset.symbol,
          aum: valuation ? formatAmount(valuation.poolNav) : null,
          aumUnavailableReason: valuation ? null : 'No price source can currently value this pool.',
        };
      }),
    );
  }

  /** Per-asset holdings and exposure for one strategy's pool. */
  async positions(strategyId: string, userId: string, callerRoles: UserRole[]) {
    await this.assignments.assertAssigned(strategyId, userId, callerRoles);
    const strategy = await this.requireStrategy(strategyId);
    const valuation = await this.nav.valuePool(strategyId);

    const poolNavIsZero = valuation.poolNav.isZero();
    return {
      strategyId,
      slug: strategy.slug,
      baseAssetSymbol: strategy.baseAsset.symbol,
      aum: formatAmount(valuation.poolNav),
      markSource: valuation.markSource,
      positions: valuation.marks.map((m) => ({
        assetSymbol: m.assetSymbol,
        quantity: m.quantity,
        markPrice: m.price,
        value: m.value,
        // Share of AUM this one asset represents — the risk panel's headline number. Undefined
        // rather than a divide-by-zero NaN on an empty pool.
        exposurePct: poolNavIsZero
          ? null
          : formatAmount(
              new HighPrecision(m.value).dividedBy(new HighPrecision(valuation.poolNav.toString())).times(100),
              4,
            ),
      })),
    };
  }

  async listOrders(strategyId: string, userId: string, callerRoles: UserRole[]) {
    await this.assignments.assertAssigned(strategyId, userId, callerRoles);
    const orders = await this.prisma.strategyOrder.findMany({
      where: { strategyId },
      include: { fromAsset: true, toAsset: true, placedBy: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.toOrderView(o));
  }

  // ── Write: place / cancel ─────────────────────────────────────────────────

  async placeOrder(strategyId: string, userId: string, callerRoles: UserRole[], dto: PlaceOrderDto) {
    // No ExecutionVenue exists yet (MVP22). An order recorded in live mode would sit forever
    // un-fillable, looking like a working feature that silently does nothing — worse than
    // refusing outright. Checked before anything else, matching WalletService.faucet.
    if (this.config.isLive) {
      throw new ForbiddenException({
        code: 'SANDBOX_ONLY',
        message: 'The trading terminal has no live execution venue yet and is sandbox-only.',
      });
    }

    await this.assignments.assertAssigned(strategyId, userId, callerRoles);
    const strategy = await this.requireStrategy(strategyId);
    if (!TRADEABLE_STATUSES.has(strategy.status)) {
      throw new BadRequestException({
        code: 'STRATEGY_NOT_TRADEABLE',
        message: `A strategy in status ${strategy.status} cannot be traded.`,
      });
    }
    if (dto.fromAssetId === dto.toAssetId) {
      throw new BadRequestException({
        code: 'SAME_ASSET',
        message: 'fromAsset and toAsset must be different.',
      });
    }
    const fromQuantity = new Prisma.Decimal(dto.fromQuantity);
    if (fromQuantity.isZero()) {
      throw new BadRequestException({ code: 'ZERO_QUANTITY', message: 'fromQuantity cannot be zero.' });
    }
    const [fromAsset, toAsset] = await Promise.all([
      this.prisma.asset.findUnique({ where: { id: dto.fromAssetId } }),
      this.prisma.asset.findUnique({ where: { id: dto.toAssetId } }),
    ]);
    if (!fromAsset?.isEnabled || !toAsset?.isEnabled) {
      throw new BadRequestException({ code: 'INVALID_ASSET', message: 'Both assets must exist and be enabled.' });
    }

    let triggerPrice: Prisma.Decimal | null = null;
    if (dto.type !== StrategyOrderType.MARKET) {
      if (!dto.triggerPrice) {
        throw new BadRequestException({
          code: 'TRIGGER_PRICE_REQUIRED',
          message: `${dto.type} orders require triggerPrice.`,
        });
      }
      triggerPrice = new Prisma.Decimal(dto.triggerPrice);
      if (triggerPrice.lessThanOrEqualTo(0)) {
        throw new BadRequestException({ code: 'INVALID_TRIGGER_PRICE', message: 'triggerPrice must be positive.' });
      }
    }

    const key = dto.idempotencyKey ?? randomUUID();
    const existing = await this.prisma.strategyOrder.findUnique({ where: { idempotencyKey: key } });
    if (existing) return this.toOrderView(await this.hydrate(existing));

    const order = await this.prisma.strategyOrder.create({
      data: {
        strategyId,
        placedByUserId: userId,
        fromAssetId: dto.fromAssetId,
        toAssetId: dto.toAssetId,
        type: dto.type,
        fromQuantity,
        triggerPrice,
        idempotencyKey: key,
      },
    });

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'strategy_order.placed',
      entityType: 'StrategyOrder',
      entityId: order.id,
      metadata: {
        strategyId,
        fromAsset: fromAsset.symbol,
        toAsset: toAsset.symbol,
        fromQuantity: formatAmount(fromQuantity),
        type: dto.type,
      },
    });

    if (dto.type === StrategyOrderType.MARKET) {
      const filled = await this.attemptFill(order);
      return this.toOrderView(filled);
    }

    return this.toOrderView(order);
  }

  async cancelOrder(strategyId: string, orderId: string, userId: string, callerRoles: UserRole[]) {
    await this.assignments.assertAssigned(strategyId, userId, callerRoles);
    const order = await this.prisma.strategyOrder.findUnique({ where: { id: orderId } });
    if (!order || order.strategyId !== strategyId) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found.' });
    }
    if (order.status !== StrategyOrderStatus.PENDING) {
      throw new BadRequestException({
        code: 'ORDER_NOT_CANCELLABLE',
        message: `Only a PENDING order can be cancelled (this one is ${order.status}).`,
      });
    }

    const cancelled = await this.prisma.strategyOrder.update({
      where: { id: orderId },
      data: { status: StrategyOrderStatus.CANCELLED, cancelledAt: new Date() },
    });

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'strategy_order.cancelled',
      entityType: 'StrategyOrder',
      entityId: order.id,
      metadata: { strategyId },
    });

    return this.toOrderView(cancelled);
  }

  // ── Fill mechanics (shared by immediate MARKET fills and the sweep) ──────

  /**
   * Books the simulated fill through the ledger and updates the order row to match, or marks it
   * REJECTED if it can't be filled right now. `LedgerService.post`'s idempotency key is
   * deterministic on the order id, so a crash between the ledger post and this row update is
   * safe to retry: the replayed post is a no-op and the row update just catches up.
   */
  private async attemptFill(order: StrategyOrder): Promise<StrategyOrder> {
    let rate: Prisma.Decimal;
    try {
      const mark = await this.marks.requireMark(order.fromAssetId, order.toAssetId);
      rate = mark.price;
    } catch (err) {
      if (err instanceof NoMarkError || err instanceof StaleMarkError) {
        // Transient — pricing may recover before the next sweep tick. Leave PENDING rather than
        // rejecting an order over a temporarily dead feed.
        this.logger.warn(`Order ${order.id}: cannot price fill yet — ${err.message}`);
        return order;
      }
      throw err;
    }

    const toQuantity = quantize(new HighPrecision(order.fromQuantity.toString()).times(new HighPrecision(rate.toString())));

    try {
      const posted = await this.ledger.post({
        type: LedgerTransactionType.TRADE,
        idempotencyKey: `strategy-order-fill:${order.id}`,
        referenceType: 'StrategyOrder',
        referenceId: order.id,
        metadata: { sandboxFill: true, rate: rate.toString(), placedByUserId: order.placedByUserId },
        legs: [
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: order.fromAssetId,
            type: LedgerAccountType.STRATEGY_POOL,
            strategyId: order.strategyId,
            amount: exactNeg(order.fromQuantity),
          },
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: order.fromAssetId,
            type: LedgerAccountType.SANDBOX_TRADE_EXECUTION,
            amount: order.fromQuantity,
          },
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: order.toAssetId,
            type: LedgerAccountType.SANDBOX_TRADE_EXECUTION,
            amount: exactNeg(toQuantity),
          },
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: order.toAssetId,
            type: LedgerAccountType.STRATEGY_POOL,
            strategyId: order.strategyId,
            amount: toQuantity,
          },
        ],
      });

      return this.prisma.strategyOrder.update({
        where: { id: order.id },
        data: {
          status: StrategyOrderStatus.FILLED,
          filledRate: rate,
          toQuantity,
          filledAt: new Date(),
          ledgerTransactionId: posted.id,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Order ${order.id} rejected at fill time: ${message}`);
      return this.prisma.strategyOrder.update({
        where: { id: order.id },
        data: { status: StrategyOrderStatus.REJECTED, rejectionReason: message },
      });
    }
  }

  /**
   * Scheduled entry point (see `TradingModule`'s bootstrap wiring): every PENDING LIMIT/STOP
   * order, checked against the current mark and filled if its trigger has crossed. LIMIT fills
   * once the achievable rate has risen to at least `triggerPrice` (take-profit shape); STOP
   * fills once it has fallen to or below it (stop-loss shape). Runs only in sandbox mode — see
   * `placeOrder`'s own guard; a live deployment never has PENDING orders to sweep because
   * placement itself is refused.
   */
  async sweepPendingOrders(): Promise<void> {
    const pending = await this.prisma.strategyOrder.findMany({
      where: { status: StrategyOrderStatus.PENDING },
    });
    for (const order of pending) {
      try {
        const mark = await this.marks.requireMark(order.fromAssetId, order.toAssetId);
        const triggered =
          order.type === StrategyOrderType.LIMIT
            ? mark.price.greaterThanOrEqualTo(order.triggerPrice!)
            : mark.price.lessThanOrEqualTo(order.triggerPrice!);
        if (triggered) {
          await this.attemptFill(order);
        }
      } catch (err) {
        if (err instanceof NoMarkError || err instanceof StaleMarkError) continue;
        this.logger.error(`Sweep failed for order ${order.id}: ${(err as Error).message}`);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async requireStrategy(strategyId: string) {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { id: strategyId },
      include: { baseAsset: true },
    });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }
    return strategy;
  }

  private async hydrate(order: StrategyOrder) {
    return this.prisma.strategyOrder.findUniqueOrThrow({ where: { id: order.id } });
  }

  private toOrderView(order: StrategyOrder) {
    return {
      id: order.id,
      strategyId: order.strategyId,
      fromAssetId: order.fromAssetId,
      toAssetId: order.toAssetId,
      type: order.type,
      status: order.status,
      fromQuantity: formatAmount(order.fromQuantity),
      triggerPrice: order.triggerPrice ? formatAmount(order.triggerPrice) : null,
      filledRate: order.filledRate ? formatAmount(order.filledRate) : null,
      toQuantity: order.toQuantity ? formatAmount(order.toQuantity) : null,
      rejectionReason: order.rejectionReason,
      createdAt: order.createdAt,
      filledAt: order.filledAt,
      cancelledAt: order.cancelledAt,
    };
  }
}
