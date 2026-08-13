import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('User not found.');

    const { passwordHash: _passwordHash, totpSecretEnc: _totpSecretEnc, ...safe } = user;
    return safe;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { antiPhishingCode, ...profileFields } = dto;

    const [profile] = await this.prisma.$transaction([
      this.prisma.profile.upsert({
        where: { userId },
        create: { userId, ...profileFields },
        update: profileFields,
      }),
      ...(antiPhishingCode !== undefined
        ? [this.prisma.user.update({ where: { id: userId }, data: { antiPhishingCode } })]
        : []),
    ]);

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'user.profile_updated',
      entityType: 'Profile',
      entityId: profile.id,
    });

    return profile;
  }

  async listDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        label: true,
        userAgent: true,
        ip: true,
        trusted: true,
        firstSeenAt: true,
        lastSeenAt: true,
        revokedAt: true,
      },
    });
  }

  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) throw new NotFoundException('Device not found.');

    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } }),
      this.prisma.refreshSession.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'security.device_revoked',
      entityType: 'Device',
      entityId: deviceId,
    });
  }
}
