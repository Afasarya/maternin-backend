import { Module } from '@nestjs/common';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { HttpModule } from '@nestjs/axios';
import { BidanModule } from '../bidan/bidan.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { ConsultationsController } from './consultations.controller.js';
import { ConsultationsService } from './consultations.service.js';

@Module({
  imports: [PregnancyProfilesModule, HttpModule, BidanModule, DoctorsModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
})
export class ConsultationsModule {}
