import { Module } from '@nestjs/common';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { SupportSessionsController } from './support-sessions.controller.js';
import { SupportSessionsService } from './support-sessions.service.js';
@Module({
  imports: [PregnancyProfilesModule],
  controllers: [SupportSessionsController],
  providers: [SupportSessionsService],
})
export class SupportSessionsModule {}
