import { SetMetadata } from '@nestjs/common';

export const REQUIRES_STEP_UP_KEY = 'requiresStepUp';

/**
 * Marks a route as requiring a *recent* 2FA/re-auth assertion, not just a valid session —
 * enforced by StepUpGuard. Used starting MVP3 on withdrawal creation, security-setting
 * changes, and API key creation (docs/04-api-architecture.md §3).
 */
export const RequiresStepUp = () => SetMetadata(REQUIRES_STEP_UP_KEY, true);
