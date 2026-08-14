import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditActorType, LedgerAccountType, LedgerTransactionType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { RequestMeta } from '../common/types/request-meta';
import { LedgerService } from '../ledger/ledger.service';
import { PLATFORM_SYSTEM_USER_ID } from '../ledger/ledger.constants';
import { BalanceView } from '../ledger/ledger.types';
import { PrismaService } from '../prisma/prisma.service';
import { FaucetDto } from './dto/faucet.dto';
import { InternalTransferDto, USER_TRANSFERABLE_BUCKETS } from './dto/internal-transfer.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Every bucket the user has, including the ones sitting at zero — a wallet that hides empty
   * balances makes "where did my funds go?" harder to answer than it needs to be.
   */
  async getBalances(userId: string): Promise<BalanceView[]> {
    return this.ledger.getBalances(userId);
  }

  async transferInternal(userId: string, dto: InternalTransferDto, meta: RequestMeta) {
    if (dto.from === dto.to) {
      throw new BadRequestException({
        code: 'INVALID_TRANSFER',
        message: 'Source and destination must be different.',
      });
    }
    for (const bucket of [dto.from, dto.to]) {
      if (!USER_TRANSFERABLE_BUCKETS.includes(bucket as (typeof USER_TRANSFERABLE_BUCKETS)[number])) {
        throw new BadRequestException({
          code: 'INVALID_TRANSFER',
          message: `${bucket} is managed by the platform and cannot be a transfer source or destination.`,
        });
      }
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException({ code: 'INVALID_TRANSFER', message: 'Amount must be positive.' });
    }

    await this.assertAssetEnabled(dto.assetId);

    const posted = await this.ledger.post({
      type: LedgerTransactionType.TRANSFER_INTERNAL,
      // Server-generated: an internal transfer between one's own buckets has no external
      // trigger that could redeliver it, so there is no client-supplied key to honour. When
      // deposits and withdrawals land they derive theirs from the chain event instead.
      idempotencyKey: `transfer:${userId}:${randomUUID()}`,
      referenceType: 'InternalTransfer',
      referenceId: userId,
      legs: [
        { userId, assetId: dto.assetId, type: dto.from, amount: amount.negated() },
        { userId, assetId: dto.assetId, type: dto.to, amount },
      ],
    });

    await this.audit.record({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: 'wallet.transfer_internal',
      entityType: 'LedgerTransaction',
      entityId: posted.id,
      metadata: { from: dto.from, to: dto.to, assetId: dto.assetId, amount: dto.amount },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { transactionId: posted.id, balances: await this.getBalances(userId) };
  }

  /**
   * Sandbox-only testnet faucet.
   *
   * Credits play money so the wallet and (later) trading flows can be exercised end to end
   * before real deposits exist. It runs through the exact same ledger path a real deposit will
   * — debit EXTERNAL, credit the user — so it proves the deposit accounting rather than
   * bypassing it.
   *
   * It refuses to run when PLATFORM_MODE=live. That check is here, server-side, and not merely
   * a hidden button: docs/01-PRD.md principle #2 is that nothing may create the appearance of a
   * real financial operation, and the inverse holds too — nothing may create real-looking
   * balances on a live deployment.
   */
  async faucet(userId: string, dto: FaucetDto, meta: RequestMeta) {
    if (this.config.isLive) {
      throw new ForbiddenException({
        code: 'SANDBOX_ONLY',
        message: 'The testnet faucet is not available on a live deployment.',
      });
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lessThanOrEqualTo(0) || amount.greaterThan(new Prisma.Decimal('100000'))) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Faucet amount must be between 0 and 100000.',
      });
    }

    await this.assertAssetEnabled(dto.assetId);

    const posted = await this.ledger.post({
      type: LedgerTransactionType.DEPOSIT,
      idempotencyKey: `faucet:${userId}:${randomUUID()}`,
      referenceType: 'SandboxFaucet',
      referenceId: userId,
      metadata: { sandboxFaucet: true },
      legs: [
        {
          userId: PLATFORM_SYSTEM_USER_ID,
          assetId: dto.assetId,
          type: LedgerAccountType.EXTERNAL,
          amount: amount.negated(),
        },
        { userId, assetId: dto.assetId, type: LedgerAccountType.AVAILABLE, amount },
      ],
    });

    await this.audit.record({
      actorType: AuditActorType.SYSTEM,
      actorId: userId,
      action: 'wallet.sandbox_faucet',
      entityType: 'LedgerTransaction',
      entityId: posted.id,
      metadata: { assetId: dto.assetId, amount: dto.amount },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { transactionId: posted.id, balances: await this.getBalances(userId) };
  }

  async listAssets() {
    const assets = await this.prisma.asset.findMany({
      where: { isEnabled: true },
      include: { chain: true },
      orderBy: [{ symbol: 'asc' }],
    });
    return assets.map((a) => ({
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      decimals: a.decimals,
      chainKey: a.chain.key,
      chainName: a.chain.name,
      isTestnet: a.chain.isTestnet,
    }));
  }

  private async assertAssetEnabled(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || !asset.isEnabled) {
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Unknown or disabled asset.' });
    }
  }
}
