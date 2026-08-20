import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditActorType, RiskLimitChangeStatus, RiskLimitField } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const FIELD_COLUMN: Record<RiskLimitField, 'maxDrawdownBps' | 'maxAssetExposureBps' | 'maxLeverageBps' | 'dailyLossLimitBps'> = {
  [RiskLimitField.MAX_DRAWDOWN_BPS]: 'maxDrawdownBps',
  [RiskLimitField.MAX_ASSET_EXPOSURE_BPS]: 'maxAssetExposureBps',
  [RiskLimitField.MAX_LEVERAGE_BPS]: 'maxLeverageBps',
  [RiskLimitField.DAILY_LOSS_LIMIT_BPS]: 'dailyLossLimitBps',
};

/**
 * Dual control on risk-limit changes (docs/12 §8): "proposed by one role, approved by another,
 * both recorded. A single compromised account cannot widen its own limits." Enforced twice —
 * `approve` rejects a self-approval, and the DB CHECK constraint on `RiskLimitChangeRequest`
 * rejects it too, so the guarantee holds even if a future code path bypasses this service.
 *
 * `InvestmentStrategy`'s four limit columns are written only from `approve` — nowhere else in
 * the codebase updates them, including `InvestmentStrategiesService.update`.
 */
@Injectable()
export class RiskLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async propose(strategyId: string, field: RiskLimitField, newValue: number, proposedByUserId: string) {
    const strategy = await this.prisma.investmentStrategy.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }
    if (newValue < 0 || newValue > 10000) {
      throw new BadRequestException({ code: 'OUT_OF_RANGE', message: 'A bps value must be between 0 and 10000.' });
    }
    if (field === RiskLimitField.MAX_DRAWDOWN_BPS && newValue > 1000) {
      // The hard platform ceiling (CLAUDE.md §2, docs/10 §4) — dual control raises a limit up to
      // it, never past it. Enforced here as well as by the CHECK constraint on
      // InvestmentStrategy itself, which `approve`'s write still has to satisfy.
      throw new BadRequestException({
        code: 'ABOVE_PLATFORM_CEILING',
        message: 'maxDrawdownBps cannot be proposed above the 1000 (10%) platform ceiling.',
      });
    }

    const column = FIELD_COLUMN[field];
    const oldValue = strategy[column] ?? -1; // dailyLossLimitBps may be null ("unconfigured").

    const request = await this.prisma.riskLimitChangeRequest.create({
      data: { strategyId, field, oldValue, newValue, proposedByUserId },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: proposedByUserId,
      action: 'risk_limit_change.proposed',
      entityType: 'RiskLimitChangeRequest',
      entityId: request.id,
      metadata: { strategyId, field, oldValue, newValue },
    });

    return request;
  }

  async approve(requestId: string, approvedByUserId: string) {
    const request = await this.requirePending(requestId);
    if (request.proposedByUserId === approvedByUserId) {
      throw new ForbiddenException({
        code: 'SELF_APPROVAL',
        message: 'The proposer cannot also approve their own risk-limit change.',
      });
    }

    const column = FIELD_COLUMN[request.field];
    const [updated] = await this.prisma.$transaction([
      this.prisma.investmentStrategy.update({
        where: { id: request.strategyId },
        data: { [column]: request.newValue },
      }),
      this.prisma.riskLimitChangeRequest.update({
        where: { id: requestId },
        data: { status: RiskLimitChangeStatus.APPROVED, approvedByUserId, approvedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: approvedByUserId,
      action: 'risk_limit_change.approved',
      entityType: 'RiskLimitChangeRequest',
      entityId: requestId,
      metadata: { strategyId: request.strategyId, field: request.field, newValue: request.newValue },
    });

    return updated;
  }

  /** A formal "no" from someone other than the proposer — still a control, distinct from a withdrawal. */
  async reject(requestId: string, rejectedByUserId: string, reason: string) {
    const request = await this.requirePending(requestId);
    if (request.proposedByUserId === rejectedByUserId) {
      throw new ForbiddenException({
        code: 'SELF_REJECTION',
        message: "Use cancel to withdraw your own proposal — reject is for someone else's review.",
      });
    }

    const rejected = await this.prisma.riskLimitChangeRequest.update({
      where: { id: requestId },
      data: { status: RiskLimitChangeStatus.REJECTED, approvedByUserId: rejectedByUserId, rejectionReason: reason },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: rejectedByUserId,
      action: 'risk_limit_change.rejected',
      entityType: 'RiskLimitChangeRequest',
      entityId: requestId,
      metadata: { strategyId: request.strategyId, reason },
    });

    return rejected;
  }

  /** The proposer withdrawing their own pending request — no approvedByUserId, no CHECK to satisfy. */
  async cancel(requestId: string, actorId: string) {
    const request = await this.requirePending(requestId);
    if (request.proposedByUserId !== actorId) {
      throw new ForbiddenException({
        code: 'NOT_YOUR_PROPOSAL',
        message: 'Only the proposer can cancel their own request.',
      });
    }

    const cancelled = await this.prisma.riskLimitChangeRequest.update({
      where: { id: requestId },
      data: { status: RiskLimitChangeStatus.CANCELLED },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: 'risk_limit_change.cancelled',
      entityType: 'RiskLimitChangeRequest',
      entityId: requestId,
      metadata: { strategyId: request.strategyId },
    });

    return cancelled;
  }

  async listPending(strategyId: string) {
    return this.prisma.riskLimitChangeRequest.findMany({
      where: { strategyId, status: RiskLimitChangeStatus.PENDING },
      orderBy: { proposedAt: 'asc' },
    });
  }

  private async requirePending(requestId: string) {
    const request = await this.prisma.riskLimitChangeRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Risk limit change request not found.' });
    }
    if (request.status !== RiskLimitChangeStatus.PENDING) {
      throw new BadRequestException({
        code: 'REQUEST_NOT_PENDING',
        message: `This request is already ${request.status}.`,
      });
    }
    return request;
  }
}
