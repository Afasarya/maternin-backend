import { Module } from '@nestjs/common';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { AncRecordsController } from './anc-records.controller.js';
import { AncRecordsService } from './anc-records.service.js';

@Module({
  imports: [PregnancyProfilesModule],
  controllers: [AncRecordsController],
  providers: [AncRecordsService],
  exports: [AncRecordsService],
})
export class AncRecordsModule {}
