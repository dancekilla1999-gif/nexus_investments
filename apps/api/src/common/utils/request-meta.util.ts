import { Request } from 'express';
import { RequestMeta } from '../types/request-meta';

/** Extracts the IP/user-agent/device metadata every audit-logged action captures. */
export function extractRequestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    deviceId: req.headers['x-device-id'] as string | undefined,
  };
}
