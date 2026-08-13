import { Injectable, Logger } from '@nestjs/common';
import { NotificationPort, SendNotificationInput } from './notification.port';

/**
 * Development-only adapter — logs the notification instead of sending it. This is what
 * "no mocks disguised as real" means in practice (docs/01-PRD.md principle #2): the interface
 * is production-shaped, but this implementation is honestly labeled and never claims to have
 * emailed/pushed anything.
 */
@Injectable()
export class ConsoleNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('Notification');

  async send(input: SendNotificationInput): Promise<void> {
    this.logger.log(
      `[console-adapter, not actually sent] user=${input.userId} type=${input.type} title="${input.title}"`,
    );
  }
}
