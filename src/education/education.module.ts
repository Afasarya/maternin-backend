import { Module } from '@nestjs/common';
import { EducationController } from './education.controller.js';
import { EducationService } from './education.service.js';

@Module({
  controllers: [EducationController],
  providers: [EducationService],
})
export class EducationModule {}
