import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { RiskBadge } from '../../common/constants/index.js';

export class CreateRiskAssessmentInternalDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsOptional()
  @IsUUID()
  symptom_checkin_id?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  triage_score!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  anemia_probability?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  preeclampsia_probability?: number | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  aggregate_score!: number;

  @IsEnum(RiskBadge)
  risk_badge!: RiskBadge;

  @IsArray()
  @IsString({ each: true })
  risk_factors!: string[];

  @IsString()
  @IsNotEmpty()
  recommendation_text!: string;
}
