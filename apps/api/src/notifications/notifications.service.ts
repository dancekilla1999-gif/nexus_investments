import { Inject, Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PORT, NotificationPort } from './notification.port';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  channel?: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PORT) private readonly port: NotificationPort,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const channel = input.channel ?? NotificationChannel.IN_APP;

    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        channel,
        title: input.title,
        body: input.body,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    await this.port.send({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata,
    });
  }
}
