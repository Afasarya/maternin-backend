import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PregnancyProfilesController } from './pregnancy-profiles.controller.js';
import { PregnancyProfilesService } from './pregnancy-profiles.service.js';

@Module({
  imports: [UsersModule],
  controllers: [PregnancyProfilesController],
  providers: [PregnancyProfilesService],
  exports: [PregnancyProfilesService],
})
export class PregnancyProfilesModule {}
