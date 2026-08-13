import { Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { JwtPayload } from '../common/types/authenticated-request';
import { extractRequestMeta } from '../common/utils/request-meta.util';
import { LegalService } from './legal.service';

@ApiTags('legal')
@Controller('legal/risk-disclosure')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  /** Public: a prospective investor should be able to read this before they even register. */
  @Public()
  @Get('current')
  getCurrent() {
    return this.legalService.getCurrentRiskDisclosureAgreement();
  }

  @Get('status')
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.legalService.getAcceptanceStatus(user.sub);
  }

  @Post('accept')
  accept(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.legalService.acceptCurrentRiskDisclosureAgreement(user.sub, extractRequestMeta(req));
  }
}
