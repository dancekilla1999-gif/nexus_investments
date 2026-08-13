import { Injectable } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditEventInput {
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
  userAgent?: string;
}

/**
 * Append-only writer for audit_logs — see docs/03-database-architecture.md §5. This is the
 * ONLY place in the codebase that writes to AuditLog; no module bypasses this service to
 * insert directly, and there is intentionally no update/delete method here.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: RecordAuditEventInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: event.actorType,
        actorId: event.actorId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata,
        ip: event.ip,
        userAgent: event.userAgent,
      },
    });
  }
}
