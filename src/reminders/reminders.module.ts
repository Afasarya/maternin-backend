import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import {
  REMINDER_NOTIFICATION_DISPATCHER,
  REMINDERS_QUEUE,
} from './reminders.constants.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersProcessor } from './reminders.processor.js';
import { RemindersService } from './reminders.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: REMINDERS_QUEUE }),
    forwardRef(() => PregnancyProfilesModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [RemindersController],
  providers: [
    RemindersService,
    RemindersProcessor,
    {
      provide: REMINDER_NOTIFICATION_DISPATCHER,
      useExisting: NotificationsService,
    },
  ],
  exports: [RemindersService],
})
export class RemindersModule {}
