import { forwardRef, Module } from '@nestjs/common';
import { PregnancyProfilesModule } from '../pregnancy-profiles/pregnancy-profiles.module.js';
import { FamilyCircleController } from './family-circle.controller.js';
import { FamilyCircleService } from './family-circle.service.js';

@Module({
  imports: [forwardRef(() => PregnancyProfilesModule)],
  controllers: [FamilyCircleController],
  providers: [FamilyCircleService],
  exports: [FamilyCircleService],
})
export class FamilyCircleModule {}
