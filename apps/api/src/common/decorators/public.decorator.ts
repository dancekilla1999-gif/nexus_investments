import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as not requiring authentication. Everything else is authenticated by default
 *  — the safer default for a platform that moves money (docs/05-security-architecture.md §2). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
