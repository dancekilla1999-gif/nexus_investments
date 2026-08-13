/**
 * Abstraction over "send this notification somewhere" — see docs/02-system-architecture.md
 * §5 (notifications module) and docs/09-roadmap.md. MVP1 wires only the console adapter
 * (development visibility for the events MVP1 actually emits: registration, login, 2FA
 * changes). Swapping in Resend/SES/Telegram in a later milestone means implementing this
 * interface — no calling code changes.
 */
export interface SendNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export interface NotificationPort {
  send(input: SendNotificationInput): Promise<void>;
}
