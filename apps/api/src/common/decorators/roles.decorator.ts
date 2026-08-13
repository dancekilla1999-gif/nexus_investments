import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Enforced by RolesGuard — never inferred from the frontend
 *  (docs/05-security-architecture.md §2). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
