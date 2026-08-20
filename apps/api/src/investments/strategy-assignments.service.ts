import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditActorType, StrategyAssignmentRole, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Who may trade a strategy's pool through the Manager Trading Terminal (MVP18,
 * docs/09-roadmap.md). `InvestmentStrategy` carries no owner/creator field of its own —
 * authority to trade is a grant recorded here, not implied by having created the product — so
 * "a trader assigned to strategy A cannot trade strategy B" is one check against one table for
 * every caller, the strategy's own manager included. `TradingService` calls `assertAssigned`
 * before every read or write the terminal exposes; nothing in this module trusts a caller's own
 * claim about which strategies they manage.
 */
@Injectable()
export class StrategyAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** ADMIN/SUPERADMIN bypass the table entirely — full oversight, same as risk-ops reconciliation. */
  private static readonly OVERSIGHT_ROLES: ReadonlySet<UserRole> = new Set([
    UserRole.ADMIN,
    UserRole.SUPERADMIN,
  ]);

  /**
   * Throws unless `userId` may act on `strategyId` — either an active assignment exists, or the
   * caller holds an oversight role. Callers pass the roles from the caller's own JWT, not a
   * fresh DB read, matching how `RolesGuard` already trusts the token elsewhere in this codebase.
   */
  async assertAssigned(strategyId: string, userId: string, callerRoles: UserRole[]): Promise<void> {
    if (callerRoles.some((r) => StrategyAssignmentsService.OVERSIGHT_ROLES.has(r))) {
      return;
    }
    const assignment = await this.prisma.strategyAssignment.findFirst({
      where: { strategyId, userId, revokedAt: null },
    });
    if (!assignment) {
      throw new ForbiddenException({
        code: 'NOT_ASSIGNED_TO_STRATEGY',
        message: 'You are not assigned to trade this strategy.',
      });
    }
  }

  /** Strategy ids `userId` currently holds an active assignment on (oversight roles excluded — they see everything, which is a different endpoint). */
  async assignedStrategyIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.strategyAssignment.findMany({
      where: { userId, revokedAt: null },
      select: { strategyId: true },
    });
    return rows.map((r) => r.strategyId);
  }

  async assign(
    strategyId: string,
    userId: string,
    role: StrategyAssignmentRole,
    assignedByUserId: string,
  ) {
    const strategy = await this.prisma.investmentStrategy.findUnique({ where: { id: strategyId } });
    if (!strategy) {
      throw new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Strategy not found.' });
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    // upsert: re-assigning after a revocation reactivates the same row (clears revokedAt) rather
    // than inserting a second one — @@unique([strategyId, userId]) means there can only ever be
    // one relationship between a strategy and a user here, active or not.
    const assignment = await this.prisma.strategyAssignment.upsert({
      where: { strategyId_userId: { strategyId, userId } },
      update: { role, assignedByUserId, assignedAt: new Date(), revokedAt: null },
      create: { strategyId, userId, role, assignedByUserId },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: assignedByUserId,
      action: 'strategy_assignment.granted',
      entityType: 'StrategyAssignment',
      entityId: assignment.id,
      metadata: { strategyId, userId, role },
    });

    return assignment;
  }

  async revoke(strategyId: string, userId: string, revokedByUserId: string) {
    const assignment = await this.prisma.strategyAssignment.findUnique({
      where: { strategyId_userId: { strategyId, userId } },
    });
    if (!assignment || assignment.revokedAt) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'No active assignment for that strategy and user.',
      });
    }

    const revoked = await this.prisma.strategyAssignment.update({
      where: { id: assignment.id },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId: revokedByUserId,
      action: 'strategy_assignment.revoked',
      entityType: 'StrategyAssignment',
      entityId: assignment.id,
      metadata: { strategyId, userId },
    });

    return revoked;
  }

  async list(strategyId: string) {
    return this.prisma.strategyAssignment.findMany({
      where: { strategyId, revokedAt: null },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { assignedAt: 'asc' },
    });
  }
}
