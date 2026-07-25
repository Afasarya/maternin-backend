import { Module } from '@nestjs/common';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { RiskAssessmentsCacheService } from './risk-assessments-cache.service.js';
import { RiskAssessmentsController } from './risk-assessments.controller.js';
import { RiskAssessmentsService } from './risk-assessments.service.js';

@Module({
  imports: [PregnancyProfilesModule],
  controllers: [RiskAssessmentsController],
  providers: [
    RiskAssessmentsService,
    RiskAssessmentsCacheService,
    InternalAuthGuard,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [RiskAssessmentsService],
})
export class RiskAssessmentsModule {}
