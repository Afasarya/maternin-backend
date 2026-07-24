import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AncRecordsModule } from '../anc-records/anc-records.module.js';
import { AiServiceModule } from '../common/services/ai-service.module.js';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { RiskAssessmentsModule } from '../risk-assessments/risk-assessments.module.js';
import { TRIAGE_RETRY_QUEUE } from './symptom-checkins.constants.js';
import { SymptomCheckinsController } from './symptom-checkins.controller.js';
import { SymptomCheckinsService } from './symptom-checkins.service.js';
import { TriageRetryProcessor } from './triage-retry.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: TRIAGE_RETRY_QUEUE }),
    AncRecordsModule,
    PregnancyProfilesModule,
    AiServiceModule,
    RiskAssessmentsModule,
  ],
  controllers: [SymptomCheckinsController],
  providers: [SymptomCheckinsService, TriageRetryProcessor],
  exports: [SymptomCheckinsService],
})
export class SymptomCheckinsModule {}
