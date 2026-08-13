import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditActorType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../common/types/request-meta';
import { AcceptanceStatus } from './dto/acceptance-status.dto';
import { AgreementResponseDto } from './dto/agreement-response.dto';

/**
 * Records the legal precondition every Managed Account will require
 * (docs/10-managed-accounts-architecture.md §3) — not the account itself, which doesn't exist
 * yet (that's MVP11). This module is deliberately small and self-contained: reading and
 * accepting a risk disclosure has no dependency on wallet/ledger/trading, so there's no reason
 * to wait for MVP11 to start capturing accurate, audit-logged consent.
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCurrentRiskDisclosureAgreement(): Promise<AgreementResponseDto> {
    const agreement = await this.prisma.riskDisclosureAgreement.findFirst({
      where: { isCurrent: true },
      orderBy: { version: 'desc' },
    });
    if (!agreement) {
      throw new NotFoundException('No risk disclosure agreement is currently published.');
    }
    return plainToInstance(AgreementResponseDto, agreement, { excludeExtraneousValues: true });
  }

  async getAcceptanceStatus(userId: string): Promise<AcceptanceStatus> {
    const agreement = await this.prisma.riskDisclosureAgreement.findFirst({
      where: { isCurrent: true },
      orderBy: { version: 'desc' },
    });
    if (!agreement) {
      throw new NotFoundException('No risk disclosure agreement is currently published.');
    }

    const acceptance = await this.prisma.riskDisclosureAcceptance.findUnique({
      where: { userId_agreementId: { userId, agreementId: agreement.id } },
    });

    return {
      accepted: acceptance !== null,
      agreementVersion: agreement.version,
      acceptedAt: acceptance?.acceptedAt ?? null,
    };
  }

  /**
   * Idempotent by design (docs/03-database-architecture.md §3's convention applied here too):
   * accepting an already-accepted current version returns the existing record rather than
   * erroring or creating a duplicate — the unique constraint on (userId, agreementId) is the
   * backstop, this is the happy path.
   */
  async acceptCurrentRiskDisclosureAgreement(
    userId: string,
    meta: RequestMeta,
  ): Promise<AcceptanceStatus> {
    const agreement = await this.prisma.riskDisclosureAgreement.findFirst({
      where: { isCurrent: true },
      orderBy: { version: 'desc' },
    });
    if (!agreement) {
      throw new NotFoundException('No risk disclosure agreement is currently published.');
    }

    const existing = await this.prisma.riskDisclosureAcceptance.findUnique({
      where: { userId_agreementId: { userId, agreementId: agreement.id } },
    });
    if (existing) {
      return { accepted: true, agreementVersion: agreement.version, acceptedAt: existing.acceptedAt };
    }

    const acceptance = await this.prisma.riskDisclosureAcceptance.create({
      data: { userId, agreementId: agreement.id, ip: meta.ip, userAgent: meta.userAgent },
    });

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'legal.risk_disclosure.accepted',
      entityType: 'RiskDisclosureAgreement',
      entityId: agreement.id,
      metadata: { version: agreement.version },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { accepted: true, agreementVersion: agreement.version, acceptedAt: acceptance.acceptedAt };
  }

  /**
   * Guard helper for later use: docs/10-managed-accounts-architecture.md §3 requires an
   * unexpired acceptance of the *current* agreement version before a Managed Account can be
   * created or funded. No caller exists yet (ManagedAccount creation is MVP11), but the check
   * belongs here — next to the data it reads — rather than being re-derived ad hoc wherever
   * it's eventually needed.
   */
  async assertCurrentAgreementAccepted(userId: string): Promise<void> {
    const status = await this.getAcceptanceStatus(userId);
    if (!status.accepted) {
      throw new ForbiddenException(
        'You must read and accept the current risk disclosure agreement before continuing.',
      );
    }
  }
}
