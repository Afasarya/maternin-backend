import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiServiceModule } from '../common/services/ai-service.module.js';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { CHAT_RETRY_QUEUE } from './chat.constants.js';
import { ChatController } from './chat.controller.js';
import { ChatRetryProcessor } from './chat-retry.processor.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: CHAT_RETRY_QUEUE }),
    AiServiceModule,
    PregnancyProfilesModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatRetryProcessor],
})
export class ChatModule {}
