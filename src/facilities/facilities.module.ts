import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { FacilitiesCacheService } from './facilities-cache.service.js';
import { FacilitiesController } from './facilities.controller.js';
import { FacilitiesService } from './facilities.service.js';

@Module({
  imports: [HttpModule],
  controllers: [FacilitiesController],
  providers: [FacilitiesService, FacilitiesCacheService],
})
export class FacilitiesModule {}
