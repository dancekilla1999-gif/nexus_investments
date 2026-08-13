import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppConfigService } from './app-config.service';

/**
 * Boot-time safety check, not a per-request guard: PLATFORM_MODE=live must not be reachable
 * by flipping an environment variable alone. See docs/02-system-architecture.md §4 and
 * docs/05-security-architecture.md §3.
 *
 * In `live` mode we require:
 *   1. A signed compliance attestation file (config/compliance/attestation.json) — proof a
 *      legal/compliance review actually happened for this deployment, per docs/01-PRD.md §8.
 *   2. A non-development wallet signing provider (checked here defensively; the wallet module
 *      itself, landing in MVP2, enforces this again at the point signing actually happens).
 *
 * This repository ships with PLATFORM_MODE=sandbox by default and no attestation file, by
 * design — "no fake fintech" means live mode is a deliberate, reviewed act, not a default.
 */
@Injectable()
export class PlatformModeGuard implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformModeGuard.name);

  constructor(private readonly config: AppConfigService) {}

  onApplicationBootstrap() {
    if (!this.config.isLive) {
      this.logger.log(
        `PLATFORM_MODE=sandbox — no real money movement is possible from this deployment.`,
      );
      return;
    }

    const attestationPath = path.resolve(process.cwd(), 'config/compliance/attestation.json');
    if (!fs.existsSync(attestationPath)) {
      throw new Error(
        'Refusing to boot with PLATFORM_MODE=live: no compliance attestation found at ' +
          `${attestationPath}. See docs/01-PRD.md §8 and docs/05-security-architecture.md §7 — ` +
          'a jurisdiction-specific legal/compliance review must precede any live deployment.',
      );
    }

    const walletSigningProvider = process.env.WALLET_SIGNING_PROVIDER ?? '';
    if (walletSigningProvider === '' || walletSigningProvider === 'local-dev-keystore') {
      throw new Error(
        'Refusing to boot with PLATFORM_MODE=live: WALLET_SIGNING_PROVIDER is unset or set to ' +
          'the development-only local keystore. Production requires an MPC- or HSM-backed ' +
          'signing provider — see docs/06-blockchain-architecture.md §4.',
      );
    }

    this.logger.warn('PLATFORM_MODE=live — real money movement is enabled on this deployment.');
  }
}
