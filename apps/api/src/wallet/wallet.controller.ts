import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { extractRequestMeta } from '../common/utils/request-meta.util';
import { FaucetDto } from './dto/faucet.dto';
import { InternalTransferDto } from './dto/internal-transfer.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balances')
  getBalances(@CurrentUser() user: JwtPayload) {
    return this.walletService.getBalances(user.sub);
  }

  @Get('assets')
  listAssets() {
    return this.walletService.listAssets();
  }

  @Post('transfers')
  transfer(@CurrentUser() user: JwtPayload, @Body() dto: InternalTransferDto, @Req() req: Request) {
    return this.walletService.transferInternal(user.sub, dto, extractRequestMeta(req));
  }

  /** Sandbox deployments only — see WalletService.faucet. */
  @Post('sandbox/faucet')
  faucet(@CurrentUser() user: JwtPayload, @Body() dto: FaucetDto, @Req() req: Request) {
    return this.walletService.faucet(user.sub, dto, extractRequestMeta(req));
  }
}
