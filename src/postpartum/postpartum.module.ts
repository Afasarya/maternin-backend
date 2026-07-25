import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiServiceModule } from '../common/services/ai-service.module.js';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { POSTPARTUM_RETRY_QUEUE } from './postpartum.constants.js';
import { PostpartumController } from './postpartum.controller.js';
import { PostpartumRetryProcessor } from './postpartum-retry.processor.js';
import { PostpartumService } from './postpartum.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: POSTPARTUM_RETRY_QUEUE }),
    PregnancyProfilesModule,
    AiServiceModule,
  ],
  controllers: [PostpartumController],
  providers: [PostpartumService, PostpartumRetryProcessor],
  exports: [PostpartumService],
})
export class PostpartumModule {}
