import { IsUUID } from 'class-validator';

export class QueryLatestRiskAssessmentDto {
  @IsUUID()
  pregnancy_profile_id!: string;
}
