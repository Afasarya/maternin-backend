import { Module } from '@nestjs/common';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { ConsultationsController } from './consultations.controller.js';
import { ConsultationsService } from './consultations.service.js';

@Module({
  imports: [PregnancyProfilesModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
})
export class ConsultationsModule {}
