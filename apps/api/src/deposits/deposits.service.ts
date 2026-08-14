import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AuditActorType,
  DepositStatus,
  LedgerAccountType,
  LedgerTransactionType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ObservedTransfer } from '../blockchain/adapter.interface';
import { BlockchainRegistry } from '../blockchain/blockchain.registry';
import { creditableAssetsOnChain } from './creditable-assets';
import { PLATFORM_SYSTEM_USER_ID } from '../ledger/ledger.constants';
import { LedgerService } from '../ledger/ledger.service';
import { formatAmount } from '../ledger/amount.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Turns observed on-chain transfers into credited user balances
 * (docs/06-blockchain-architecture.md §2).
 *
 *   detected → PENDING credit (visible, unspendable)
 *            → confirmations reached → PENDING moves to AVAILABLE
 *
 * The two-stage credit is deliberate. A user should see their deposit the moment it appears on
 * chain — an invisible deposit generates a support ticket every time — but must not be able to
 * spend it until the chain has confirmed it deeply enough that a reorg cannot take it back.
 */
@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BlockchainRegistry,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Address issuance ───────────────────────────────────────────────────

  /**
   * One deposit address per (user, chain), created on first request and stable thereafter — a
   * user who saves their address must be able to reuse it.
   *
   * The derivation index comes from a counter on the chain row taken under a row lock. Two
   * concurrent requests handing out the same index would give two users the same address and
   * make their funds indistinguishable; that is worth serialising address creation over.
   */
  async getOrCreateDepositAddress(userId: string, chainKey: string) {
    const chain = await this.prisma.chain.findUniqueOrThrow({ where: { key: chainKey } });

    const existing = await this.prisma.walletAddress.findFirst({
      where: { userId, chainId: chain.id },
    });
    if (existing) return this.toAddressView(existing.address, chain, await this.creditableAssets(chain.id));

    const adapter = await this.registry.getAdapter(chainKey);
    const custodyWallet = await this.getOrCreateHotWallet(chain.id, chainKey);

    const created = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ nextDerivationIndex: number }>>`
        SELECT "nextDerivationIndex" FROM chains WHERE id = ${chain.id} FOR UPDATE
      `;
      const index = locked.nextDerivationIndex;

      await tx.chain.update({
        where: { id: chain.id },
        data: { nextDerivationIndex: index + 1 },
      });

      return tx.walletAddress.create({
        data: {
          userId,
          chainId: chain.id,
          walletId: custodyWallet.id,
          address: adapter.deriveDepositAddress(index),
          derivationIndex: index,
        },
      });
    });

    await this.audit.record({
      actorType: AuditActorType.SYSTEM,
      actorId: userId,
      action: 'wallet.deposit_address_issued',
      entityType: 'WalletAddress',
      entityId: created.id,
      metadata: { chain: chainKey, derivationIndex: created.derivationIndex },
    });

    return this.toAddressView(created.address, chain, await this.creditableAssets(chain.id));
  }

  private toAddressView(
    address: string,
    chain: { key: string; name: string; confirmationsRequired: number; isTestnet: boolean },
    supportedAssets: string[],
  ) {
    return {
      chainKey: chain.key,
      chainName: chain.name,
      address,
      confirmationsRequired: chain.confirmationsRequired,
      isTestnet: chain.isTestnet,
      supportedAssets,
    };
  }

  /**
   * The assets a deposit to this chain can actually be credited in — computed with exactly the
   * rule the watcher uses to decide what to scan for (`scanChain`), so the two cannot drift.
   *
   * The distinction matters more than it looks. A configured-but-contract-less token row is a
   * token the scanner will never see: it is excluded from the `getLogs` address filter, and
   * `resolveAsset` cannot match a transfer to it. Listing such an asset as "supported" on the
   * deposit screen would invite a user to send funds that arrive on chain, are never detected,
   * and are never credited — the platform holds them, the user cannot see them, and only a
   * manual recovery gets them back. So the UI is told what is *creditable*, not what exists.
   */
  private async creditableAssets(chainId: string): Promise<string[]> {
    const assets = await this.prisma.asset.findMany({
      where: creditableAssetsOnChain(chainId),
      select: { symbol: true },
      orderBy: { symbol: 'asc' },
    });
    return assets.map((a) => a.symbol);
  }

  private async getOrCreateHotWallet(chainId: string, chainKey: string) {
    const existing = await this.prisma.wallet.findFirst({ where: { chainId, type: 'HOT' } });
    if (existing) return existing;
    return this.prisma.wallet.create({
      data: { chainId, type: 'HOT', label: `${chainKey} hot custody` },
    });
  }

  async listUserDeposits(userId: string) {
    const deposits = await this.prisma.deposit.findMany({
      where: { userId },
      include: { asset: true, chain: true },
      orderBy: { detectedAt: 'desc' },
      take: 50,
    });

    return deposits.map((d) => ({
      id: d.id,
      chainKey: d.chain.key,
      assetSymbol: d.asset.symbol,
      amount: formatAmount(d.amount),
      status: d.status,
      confirmations: d.confirmations,
      confirmationsRequired: d.chain.confirmationsRequired,
      txHash: d.txHash,
      explorerUrl: d.chain.explorerUrlTemplate
        ? d.chain.explorerUrlTemplate.replace('{txHash}', d.txHash)
        : null,
      detectedAt: d.detectedAt,
      creditedAt: d.creditedAt,
    }));
  }

  // ── Detection ──────────────────────────────────────────────────────────

  /**
   * Records an observed transfer as a deposit and credits it to PENDING.
   *
   * Idempotent on `(chainId, txHash, logIndex)` at the database level, so rescanning a block
   * range — after a restart, an overlapping scan window, or a reorg rewind — cannot credit the
   * same transfer twice. That property is why the watcher can be crude about re-scanning.
   */
  async recordObservedTransfer(chainId: string, transfer: ObservedTransfer): Promise<'created' | 'duplicate' | 'ignored'> {
    const existing = await this.prisma.deposit.findUnique({
      where: {
        chainId_txHash_logIndex: {
          chainId,
          txHash: transfer.txHash,
          logIndex: transfer.logIndex,
        },
      },
    });
    if (existing) return 'duplicate';

    const walletAddress = await this.prisma.walletAddress.findFirst({
      where: { chainId, address: transfer.to },
    });
    if (!walletAddress) {
      // Not one of ours. Normal: block scanning sees every transfer in range.
      return 'ignored';
    }

    const asset = await this.resolveAsset(chainId, transfer.tokenContract);
    if (!asset) {
      // A token the platform does not support arriving at a deposit address is not a deposit —
      // there is no asset record to denominate it in, and inventing one would be worse than
      // ignoring it. Logged so support can answer "where are my XYZ tokens?" truthfully.
      this.logger.warn(
        `Unsupported token ${transfer.tokenContract} sent to ${transfer.to} ` +
          `(tx ${transfer.txHash}); no asset configured, ignoring.`,
      );
      return 'ignored';
    }

    const amount = this.toDecimalAmount(transfer.amount, asset.decimals);

    try {
      const deposit = await this.prisma.deposit.create({
        data: {
          userId: walletAddress.userId,
          chainId,
          assetId: asset.id,
          txHash: transfer.txHash,
          logIndex: transfer.logIndex,
          blockNumber: transfer.blockNumber,
          fromAddress: transfer.from,
          toAddress: transfer.to,
          amount,
          status: DepositStatus.PENDING_CONFIRMATION,
          idempotencyKey: this.depositKey(chainId, transfer),
        },
      });

      // Credit PENDING immediately: visible to the user, not yet spendable.
      const posted = await this.ledger.post({
        type: LedgerTransactionType.DEPOSIT,
        idempotencyKey: `deposit-pending:${deposit.idempotencyKey}`,
        referenceType: 'Deposit',
        referenceId: deposit.id,
        legs: [
          {
            userId: PLATFORM_SYSTEM_USER_ID,
            assetId: asset.id,
            type: LedgerAccountType.EXTERNAL,
            amount: amount.negated(),
          },
          {
            userId: walletAddress.userId,
            assetId: asset.id,
            type: LedgerAccountType.PENDING,
            amount,
          },
        ],
      });

      await this.prisma.deposit.update({
        where: { id: deposit.id },
        data: { ledgerTransactionId: posted.id },
      });

      await this.audit.record({
        actorType: AuditActorType.SYSTEM,
        actorId: walletAddress.userId,
        action: 'deposit.detected',
        entityType: 'Deposit',
        entityId: deposit.id,
        metadata: { txHash: transfer.txHash, amount: formatAmount(amount), asset: asset.symbol },
      });

      await this.notifications.notify({
        userId: walletAddress.userId,
        type: NotificationType.DEPOSIT,
        title: 'Deposit detected',
        body: `${formatAmount(amount)} ${asset.symbol} seen on-chain, awaiting confirmations.`,
      });

      return 'created';
    } catch (err) {
      // Lost a race with a concurrent watcher pass; the unique index did its job.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return 'duplicate';
      }
      throw err;
    }
  }

  /**
   * Advances confirmation counts and releases fully-confirmed deposits from PENDING into
   * AVAILABLE. Safe to run repeatedly: the release posting is idempotent on the deposit's own
   * key, so a deposit cannot be released twice.
   */
  async advancePendingDeposits(chainKey: string): Promise<{ checked: number; credited: number }> {
    const chain = await this.prisma.chain.findUniqueOrThrow({ where: { key: chainKey } });
    const adapter = await this.registry.getAdapter(chainKey);

    const pending = await this.prisma.deposit.findMany({
      where: { chainId: chain.id, status: DepositStatus.PENDING_CONFIRMATION },
      include: { asset: true },
      take: 100,
    });

    let credited = 0;
    for (const deposit of pending) {
      const confirmations = await adapter.getConfirmations(deposit.txHash);
      if (confirmations === deposit.confirmations) {
        // Nothing changed; skip the write.
      } else {
        await this.prisma.deposit.update({
          where: { id: deposit.id },
          data: { confirmations },
        });
      }

      if (confirmations < chain.confirmationsRequired) continue;

      await this.ledger.post({
        type: LedgerTransactionType.DEPOSIT,
        idempotencyKey: `deposit-confirm:${deposit.idempotencyKey}`,
        referenceType: 'Deposit',
        referenceId: deposit.id,
        legs: [
          {
            userId: deposit.userId,
            assetId: deposit.assetId,
            type: LedgerAccountType.PENDING,
            amount: deposit.amount.negated(),
          },
          {
            userId: deposit.userId,
            assetId: deposit.assetId,
            type: LedgerAccountType.AVAILABLE,
            amount: deposit.amount,
          },
        ],
      });

      await this.prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: DepositStatus.CREDITED, creditedAt: new Date(), confirmations },
      });

      await this.audit.record({
        actorType: AuditActorType.SYSTEM,
        actorId: deposit.userId,
        action: 'deposit.credited',
        entityType: 'Deposit',
        entityId: deposit.id,
        metadata: { confirmations, amount: formatAmount(deposit.amount) },
      });

      await this.notifications.notify({
        userId: deposit.userId,
        type: NotificationType.DEPOSIT,
        title: 'Deposit credited',
        body: `${formatAmount(deposit.amount)} ${deposit.asset.symbol} is now available.`,
      });

      credited++;
    }

    return { checked: pending.length, credited };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private depositKey(chainId: string, transfer: ObservedTransfer): string {
    return `${chainId}:${transfer.txHash}:${transfer.logIndex}`;
  }

  private async resolveAsset(chainId: string, tokenContract: string | null) {
    if (tokenContract === null) {
      return this.prisma.asset.findFirst({ where: { chainId, kind: 'NATIVE', isEnabled: true } });
    }
    return this.prisma.asset.findFirst({
      where: { chainId, contractAddress: { equals: tokenContract, mode: 'insensitive' }, isEnabled: true },
    });
  }

  /**
   * Chain base units (wei) → the ledger's decimal representation. Done with Decimal arithmetic
   * on the string form, never by converting a bigint to a JavaScript number: 10^18 wei exceeds
   * Number.MAX_SAFE_INTEGER by ten orders of magnitude.
   */
  private toDecimalAmount(baseUnits: bigint, decimals: number): Prisma.Decimal {
    if (decimals < 0 || decimals > 30) {
      throw new BadRequestException(`Implausible asset decimals: ${decimals}`);
    }
    return new Prisma.Decimal(baseUnits.toString()).dividedBy(new Prisma.Decimal(10).pow(decimals));
  }
}
