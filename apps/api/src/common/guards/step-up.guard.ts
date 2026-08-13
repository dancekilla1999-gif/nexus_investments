import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_STEP_UP_KEY } from '../decorators/requires-step-up.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

const STEP_UP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * See docs/04-api-architecture.md §3. Not yet applied to any MVP1 route (there is nothing
 * step-up-worthy until withdrawals/security settings land in MVP3) — provided now so the
 * contract is stable when those routes are added.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requires = this.reflector.getAllAndOverride<boolean>(REQUIRES_STEP_UP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requires) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.stepUp) {
      throw new ForbiddenException('This action requires a fresh 2FA verification.');
    }
    return true;
  }
}

export { STEP_UP_WINDOW_MS };
