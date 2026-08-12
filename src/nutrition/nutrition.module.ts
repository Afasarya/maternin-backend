import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChatModule } from '../chat/chat.module.js';
import { AiServiceModule } from '../common/services/ai-service.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { FonnteWebhookController } from './fonnte-webhook.controller.js';
import { FonnteWebhookAuthGuard } from './guards/fonnte-webhook-auth.guard.js';
import { NUTRITION_QUEUE } from './nutrition.constants.js';
import { NutritionController, NutritionLogsController } from './nutrition.controller.js';
import { NutritionInternalController } from './nutrition-internal.controller.js';
import { NutritionProcessor } from './nutrition.processor.js';
import { NutritionService } from './nutrition.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: NUTRITION_QUEUE }), AiServiceModule, PregnancyProfilesModule, ChatModule, NotificationsModule],
  controllers: [NutritionController, NutritionLogsController, FonnteWebhookController, NutritionInternalController],
  providers: [NutritionService, NutritionProcessor, FonnteWebhookAuthGuard],
})
export class NutritionModule {}
