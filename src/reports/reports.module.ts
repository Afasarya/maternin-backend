import { Module } from '@nestjs/common';
import { AncRecordsModule } from '../anc-records/anc-records.module.js';
import { PostpartumModule } from '../postpartum/postpartum.module.js';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { RiskAssessmentsModule } from '../risk-assessments/risk-assessments.module.js';
import { UsersModule } from '../users/users.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [
    PregnancyProfilesModule,
    RiskAssessmentsModule,
    AncRecordsModule,
    PostpartumModule,
    UsersModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
