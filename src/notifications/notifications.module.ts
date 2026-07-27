import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { FamilyCircleModule } from '../family-circle/family-circle.module.js';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { FonnteClient } from './fonnte.client.js';
import { NOTIFICATIONS_QUEUE } from './notifications.constants.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsProcessor } from './notifications.processor.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    HttpModule,
    FamilyCircleModule,
    forwardRef(() => PregnancyProfilesModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor, FonnteClient],
  exports: [NotificationsService],
})
export class NotificationsModule {}
