import { forwardRef, Module } from '@nestjs/common';
import { RemindersModule } from '../reminders/reminders.module.js';
import { UsersModule } from '../users/users.module.js';
import { PregnancyProfilesController } from './pregnancy-profiles.controller.js';
import { PregnancyProfilesService } from './pregnancy-profiles.service.js';

@Module({
  imports: [UsersModule, forwardRef(() => RemindersModule)],
  controllers: [PregnancyProfilesController],
  providers: [PregnancyProfilesService],
  exports: [PregnancyProfilesService],
})
export class PregnancyProfilesModule {}
