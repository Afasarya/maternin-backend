import { IsBoolean, IsString, IsUUID, MaxLength } from 'class-validator';

export class NutritionAnomalyCallbackDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsBoolean()
  anomaly_detected!: boolean;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}
