import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  LedgerAccountType,
  LedgerTransactionType,
  NotificationType,
  Prisma,
  RedemptionRequestStatus,
  StrategyStatus,
  SubscriptionRequestStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { exactDiff, exactNeg, exactSum, formatAmount } from '../ledger/amount.util';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Subscription and redemption — the investor side of Mode B (docs/12 §2.2, docs/14 steps 2–3 and 8).
 *
 * The single most important property here: **committing capital and buying units are two
 * separate events.** Money moves out of the wallet immediately, into a `PENDING_SUBSCRIPTION`
 * bucket the investor still owns; units are only issued later, at a dealing point, using a NAV
 * struck from marks the pool did not choose.
 *
 * Collapsing those two steps — issuing units at whatever the last known price was — is how an
 * investor either captures gains that belong to existing holders or is diluted by them. Both
 * are the same bug and both are theft in slow motion, so the split is structural rather than a
 * matter of when the code happens to run.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Subscribe ───────────────────────────────────────────────────────────

  async subscribe(userId: string, slug: string, amount: string, idempotencyKey?: string) {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { slug },
      include: { baseAsset: true },
    });
    if (!strategy || strategy.status === StrategyStatus.DRAFT) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }
    if (strategy.status !== StrategyStatus.OPEN) {
      throw new ForbiddenException({
        code: 'STRATEGY_NOT_OPEN',
        message: `This strategy is ${strategy.status.toLowerCase().replace('_', ' ')} and is not accepting new capital.`,
      });
    }

    // Consent first. An investment made without a recorded acceptance of the current risk
    // disclosure is exactly the situation docs/10 §3 exists to prevent, so it is checked here
    // rather than trusted to the UI having shown a checkbox.
    const acceptance = await this.currentAcceptance(userId);
    if (!acceptance) {
      throw new ForbiddenException({
        code: 'RISK_DISCLOSURE_REQUIRED',
        message: 'You must read and accept the current risk disclosure before investing.',
      });
    }

    const value = new Prisma.Decimal(amount);
    if (value.lessThanOrEqualTo(0)) {
      throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Amount must be positive.' });
    }
    if (value.lessThan(strategy.minimumInvestment)) {
      throw new BadRequestException({
        code: 'BELOW_MINIMUM',
        message: `The minimum investment for this strategy is ${formatAmount(strategy.minimumInvestment)} ${strategy.baseAsset.symbol}.`,
      });
    }

    // The maximum applies to the investor's total exposure, not to one transaction — otherwise
    // it is trivially bypassed by subscribing twice.
    if (strategy.maximumInvestment) {
      const position = await this.prisma.investmentPosition.findUnique({
        where: { userId_strategyId: { userId, strategyId: strategy.id } },
      });
      const pendingTotal = await this.pendingSubscriptionTotal(userId, strategy.id);
      const committed = exactSum(position?.costBasis ?? new Prisma.Decimal(0), pendingTotal, value);
      if (committed.greaterThan(strategy.maximumInvestment)) {
        throw new BadRequestException({
          code: 'ABOVE_MAXIMUM',
          message: `That would take your total investment in this strategy above the ${formatAmount(strategy.maximumInvestment)} ${strategy.baseAsset.symbol} limit.`,
        });
      }
    }

    const key = idempotencyKey ?? randomUUID();
    const existing = await this.prisma.subscriptionRequest.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) return this.toSubscriptionView(existing, strategy.baseAsset.symbol);

    // Value leaves AVAILABLE and sits in PENDING_SUBSCRIPTION — still the investor's, earning
    // nothing, returned in full if cancelled before the dealing point. The ledger rejects this
    // if the balance is insufficient; there is no separate "do they have enough?" read that
    // could race with a concurrent trade.
    const request = await this.prisma.subscriptionRequest.create({
      data: {
        userId,
        strategyId: strategy.id,
        amount: value,
        acceptanceId: acceptance.id,
        idempotencyKey: key,
      },
    });

    try {
      await this.ledger.post({
        type: LedgerTransactionType.TRANSFER_INTERNAL,
        idempotencyKey: `subscription-commit:${request.id}`,
        referenceType: 'SubscriptionRequest',
        referenceId: request.id,
        legs: [
          { userId, assetId: strategy.baseAssetId, type: LedgerAccountType.AVAILABLE, amount: exactNeg(value) },
          { userId, assetId: strategy.baseAssetId, type: LedgerAccountType.PENDING_SUBSCRIPTION, amount: value },
        ],
      });
    } catch (err) {
      // The commitment did not happen, so the request must not linger as if it had.
      await this.prisma.subscriptionRequest.update({
        where: { id: request.id },
        data: { status: SubscriptionRequestStatus.CANCELLED, cancelledAt: new Date() },
      });
      throw err;
    }

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'investment.subscription_requested',
      entityType: 'SubscriptionRequest',
      entityId: request.id,
      metadata: {
        strategy: strategy.slug,
        amount: formatAmount(value),
        acceptedDisclosureId: acceptance.agreementId,
      },
    });

    return this.toSubscriptionView(request, strategy.baseAsset.symbol);
  }

  /** Full refund, no fee — the money never left the investor. */
  async cancelSubscription(userId: string, requestId: string) {
    const request = await this.prisma.subscriptionRequest.findUnique({
      where: { id: requestId },
      include: { strategy: { include: { baseAsset: true } } },
    });
    if (!request || request.userId !== userId) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Subscription request not found.' });
    }
    if (request.status !== SubscriptionRequestStatus.PENDING) {
      throw new BadRequestException({
        code: 'ALREADY_RESOLVED',
        message: `This subscription is already ${request.status.toLowerCase()} and cannot be cancelled.`,
      });
    }

    await this.ledger.post({
      type: LedgerTransactionType.TRANSFER_INTERNAL,
      idempotencyKey: `subscription-cancel:${request.id}`,
      referenceType: 'SubscriptionRequest',
      referenceId: request.id,
      legs: [
        {
          userId,
          assetId: request.strategy.baseAssetId,
          type: LedgerAccountType.PENDING_SUBSCRIPTION,
          amount: exactNeg(request.amount),
        },
        {
          userId,
          assetId: request.strategy.baseAssetId,
          type: LedgerAccountType.AVAILABLE,
          amount: request.amount,
        },
      ],
    });

    const cancelled = await this.prisma.subscriptionRequest.update({
      where: { id: request.id },
      data: { status: SubscriptionRequestStatus.CANCELLED, cancelledAt: new Date() },
    });

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'investment.subscription_cancelled',
      entityType: 'SubscriptionRequest',
      entityId: request.id,
      metadata: { refunded: formatAmount(request.amount) },
    });

    return this.toSubscriptionView(cancelled, request.strategy.baseAsset.symbol);
  }

  // ── Redeem ──────────────────────────────────────────────────────────────

  /**
   * Denominated in units, not currency. The currency value is unknown until the dealing-point
   * NAV is struck, so quoting an amount up front would be quoting a price the platform cannot
   * honour.
   */
  async requestRedemption(userId: string, slug: string, units: string | 'ALL', idempotencyKey?: string) {
    const strategy = await this.prisma.investmentStrategy.findUnique({
      where: { slug },
      include: { baseAsset: true },
    });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }

    const position = await this.prisma.investmentPosition.findUnique({
      where: { userId_strategyId: { userId, strategyId: strategy.id } },
    });
    if (!position || position.units.lessThanOrEqualTo(0)) {
      throw new BadRequestException({
        code: 'NO_POSITION',
        message: 'You hold no units in this strategy.',
      });
    }

    const requested = units === 'ALL' ? position.units : new Prisma.Decimal(units);
    if (requested.lessThanOrEqualTo(0)) {
      throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Units must be positive.' });
    }

    const alreadyRequested = await this.pendingRedemptionUnits(userId, strategy.id);
    if (exactSum(requested, alreadyRequested).greaterThan(position.units)) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_UNITS',
        message: `You hold ${formatAmount(position.units)} units${
          alreadyRequested.greaterThan(0) ? `, of which ${formatAmount(alreadyRequested)} are already pending redemption` : ''
        }.`,
      });
    }

    // Lock-up and notice are stamped now, from the terms in force at request time. A later
    // configuration change must not be able to move an investor's date.
    const noticeMs = strategy.redemptionNoticeDays * 24 * 60 * 60 * 1000;
    const noticeEnds = new Date(Date.now() + noticeMs);
    const eligibleFrom =
      position.lockedUntil && position.lockedUntil > noticeEnds ? position.lockedUntil : noticeEnds;

    const key = idempotencyKey ?? randomUUID();
    const existing = await this.prisma.redemptionRequest.findUnique({ where: { idempotencyKey: key } });
    if (existing) return this.toRedemptionView(existing, strategy.baseAsset.symbol);

    const request = await this.prisma.redemptionRequest.create({
      data: {
        userId,
        strategyId: strategy.id,
        units: requested,
        eligibleFrom,
        idempotencyKey: key,
      },
    });

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'investment.redemption_requested',
      entityType: 'RedemptionRequest',
      entityId: request.id,
      metadata: {
        strategy: strategy.slug,
        units: formatAmount(requested),
        eligibleFrom: eligibleFrom.toISOString(),
      },
    });

    await this.notifications.notify({
      userId,
      type: NotificationType.INVESTMENT,
      title: 'Redemption requested',
      body: `${formatAmount(requested)} units of ${strategy.name}. Settles at the first dealing point on or after ${eligibleFrom.toISOString().slice(0, 10)}.`,
    });

    return this.toRedemptionView(request, strategy.baseAsset.symbol);
  }

  // ── Investor views ──────────────────────────────────────────────────────

  async listMyInvestments(userId: string) {
    const positions = await this.prisma.investmentPosition.findMany({
      where: { userId },
      include: { strategy: { include: { baseAsset: true } } },
    });

    return Promise.all(
      positions.map(async (position) => {
        const latest = await this.prisma.navSnapshot.findFirst({
          where: { strategyId: position.strategyId },
          orderBy: { struckAt: 'desc' },
        });

        const navPerUnit = latest?.navPerUnit ?? null;
        const gross = navPerUnit ? position.units.times(navPerUnit) : null;
        const accrued = exactSum(position.accruedMgmtFee, position.accruedPerfFee);
        const net = gross ? exactDiff(gross, accrued) : null;

        return {
          strategySlug: position.strategy.slug,
          strategyName: position.strategy.name,
          baseAssetSymbol: position.strategy.baseAsset.symbol,

          units: formatAmount(position.units),
          costBasis: formatAmount(position.costBasis),
          hwmUnitPrice: formatAmount(position.hwmUnitPrice),

          navPerUnit: navPerUnit ? formatAmount(navPerUnit) : null,
          grossValue: gross ? formatAmount(gross) : null,
          accruedMgmtFee: formatAmount(position.accruedMgmtFee),
          accruedPerfFee: formatAmount(position.accruedPerfFee),
          /** What the investor would actually receive: gross less fees they already owe. */
          netValue: net ? formatAmount(net) : null,
          pnl: net ? formatAmount(exactDiff(net, position.costBasis)) : null,

          lockedUntil: position.lockedUntil,
          perfFeeBps: position.strategy.perfFeeBps,
          mgmtFeeBps: position.strategy.mgmtFeeBps,
        };
      }),
    );
  }

  async listMyRequests(userId: string) {
    const [subscriptions, redemptions] = await Promise.all([
      this.prisma.subscriptionRequest.findMany({
        where: { userId },
        include: { strategy: { include: { baseAsset: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.redemptionRequest.findMany({
        where: { userId },
        include: { strategy: { include: { baseAsset: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      subscriptions: subscriptions.map((s) => ({
        ...this.toSubscriptionView(s, s.strategy.baseAsset.symbol),
        strategySlug: s.strategy.slug,
        strategyName: s.strategy.name,
      })),
      redemptions: redemptions.map((r) => ({
        ...this.toRedemptionView(r, r.strategy.baseAsset.symbol),
        strategySlug: r.strategy.slug,
        strategyName: r.strategy.name,
      })),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async currentAcceptance(userId: string) {
    const agreement = await this.prisma.riskDisclosureAgreement.findFirst({
      where: { isCurrent: true },
      orderBy: { version: 'desc' },
    });
    if (!agreement) return null;
    return this.prisma.riskDisclosureAcceptance.findUnique({
      where: { userId_agreementId: { userId, agreementId: agreement.id } },
    });
  }

  private async pendingSubscriptionTotal(userId: string, strategyId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.subscriptionRequest.aggregate({
      where: { userId, strategyId, status: SubscriptionRequestStatus.PENDING },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  private async pendingRedemptionUnits(userId: string, strategyId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.redemptionRequest.aggregate({
      where: {
        userId,
        strategyId,
        status: { in: [RedemptionRequestStatus.PENDING, RedemptionRequestStatus.QUEUED] },
      },
      _sum: { units: true },
    });
    return result._sum.units ?? new Prisma.Decimal(0);
  }

  private toSubscriptionView(
    request: {
      id: string;
      amount: Prisma.Decimal;
      status: SubscriptionRequestStatus;
      unitsIssued: Prisma.Decimal | null;
      createdAt: Date;
      settledAt: Date | null;
      cancelledAt: Date | null;
    },
    symbol: string,
  ) {
    return {
      id: request.id,
      kind: 'SUBSCRIPTION' as const,
      amount: formatAmount(request.amount),
      assetSymbol: symbol,
      status: request.status,
      unitsIssued: request.unitsIssued ? formatAmount(request.unitsIssued) : null,
      createdAt: request.createdAt,
      settledAt: request.settledAt,
      cancelledAt: request.cancelledAt,
    };
  }

  private toRedemptionView(
    request: {
      id: string;
      units: Prisma.Decimal;
      status: RedemptionRequestStatus;
      eligibleFrom: Date;
      grossAmount: Prisma.Decimal | null;
      feesCharged: Prisma.Decimal | null;
      netAmount: Prisma.Decimal | null;
      createdAt: Date;
      settledAt: Date | null;
    },
    symbol: string,
  ) {
    return {
      id: request.id,
      kind: 'REDEMPTION' as const,
      units: formatAmount(request.units),
      assetSymbol: symbol,
      status: request.status,
      eligibleFrom: request.eligibleFrom,
      grossAmount: request.grossAmount ? formatAmount(request.grossAmount) : null,
      feesCharged: request.feesCharged ? formatAmount(request.feesCharged) : null,
      netAmount: request.netAmount ? formatAmount(request.netAmount) : null,
      createdAt: request.createdAt,
      settledAt: request.settledAt,
    };
  }
}
