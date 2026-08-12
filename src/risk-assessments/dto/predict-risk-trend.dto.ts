import { IsUUID } from 'class-validator';

export class PredictRiskTrendDto {
  @IsUUID()
  pregnancy_profile_id!: string;
}
