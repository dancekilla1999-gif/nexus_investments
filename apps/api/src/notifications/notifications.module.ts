import { Global, Module } from '@nestjs/common';
import { ConsoleNotificationAdapter } from './console-notification.adapter';
import { NOTIFICATION_PORT } from './notification.port';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_PORT, useClass: ConsoleNotificationAdapter },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
