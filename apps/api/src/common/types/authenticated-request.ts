import { Request } from 'express';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  roles: UserRole[];
  sessionId: string;
  stepUp?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
