/** IP/user-agent/device metadata captured for audit trails on security-relevant actions. */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}
