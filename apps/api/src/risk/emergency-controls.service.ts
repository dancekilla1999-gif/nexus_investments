import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditActorType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Named, independently-toggleable kill switches (docs/12 §9). Only `GLOBAL_TRADING_PAUSE` has
 * anything real to gate today — see `EmergencyControl`'s own schema doc comment for why the
 * other named switches from docs/12 aren't here yet.
 */
export type EmergencyControlKey = 'GLOBAL_TRADING_PAUSE';

/** A TS union type alone doesn't validate a URL param at runtime — this does. */
const KNOWN_KEYS: ReadonlySet<string> = new Set<EmergencyControlKey>(['GLOBAL_TRADING_PAUSE']);

@Injectable()
export class EmergencyControlsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async isActive(key: EmergencyControlKey): Promise<boolean> {
    const row = await this.prisma.emergencyControl.findUnique({ where: { key } });
    return row?.isActive ?? false;
  }

  async list() {
    return this.prisma.emergencyControl.findMany({ orderBy: { key: 'asc' } });
  }

  async set(key: EmergencyControlKey, isActive: boolean, reason: string, actorId: string) {
    if (!KNOWN_KEYS.has(key)) {
      throw new BadRequestException({
        code: 'UNKNOWN_CONTROL_KEY',
        message: `"${key}" is not a recognised emergency control. Known keys: ${[...KNOWN_KEYS].join(', ')}.`,
      });
    }

    const row = await this.prisma.emergencyControl.upsert({
      where: { key },
      update: { isActive, reason, updatedByUserId: actorId },
      create: { key, isActive, reason, updatedByUserId: actorId },
    });

    await this.audit.record({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: isActive ? 'risk.emergency_control_activated' : 'risk.emergency_control_deactivated',
      entityType: 'EmergencyControl',
      entityId: key,
      metadata: { reason },
    });

    return row;
  }
}
