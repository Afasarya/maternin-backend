import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AncRecordsModule } from '../anc-records/anc-records.module.js';
import { SymptomCheckinsModule } from '../symptom-checkins/symptom-checkins.module.js';
import { SYNC_PROCESSING_QUEUE } from './sync.constants.js';
import { SyncController } from './sync.controller.js';
import { SyncProcessor } from './sync.processor.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [
    AncRecordsModule,
    SymptomCheckinsModule,
    BullModule.registerQueue({ name: SYNC_PROCESSING_QUEUE }),
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncProcessor],
})
export class SyncModule {}
