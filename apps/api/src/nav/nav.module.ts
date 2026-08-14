import { Module } from '@nestjs/common';
import { MarkRegistry } from './mark.registry';
import { NavService } from './nav.service';

@Module({
  providers: [MarkRegistry, NavService],
  exports: [MarkRegistry, NavService],
})
export class NavModule {}
