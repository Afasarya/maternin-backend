import { Module } from '@nestjs/common';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { BidanCacheService } from './bidan-cache.service.js';
import { BidanController } from './bidan.controller.js';
import { BidanService } from './bidan.service.js';

@Module({
  imports: [PregnancyProfilesModule],
  controllers: [BidanController],
  providers: [BidanService, BidanCacheService],
})
export class BidanModule {}
