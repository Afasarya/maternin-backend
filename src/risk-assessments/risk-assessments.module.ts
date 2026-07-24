import { Module } from '@nestjs/common';
import { RiskAssessmentsService } from './risk-assessments.service.js';

@Module({
  providers: [RiskAssessmentsService],
  exports: [RiskAssessmentsService],
})
export class RiskAssessmentsModule {}
