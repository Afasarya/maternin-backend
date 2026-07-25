import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  BleedingLevel,
  MoodFlag,
  WoundCondition,
} from '../../common/constants/index.js';

export class CreatePostpartumLogDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsInt()
  @Min(1)
  @Max(42)
  day_number!: number;

  @IsEnum(BleedingLevel)
  bleeding_level!: BleedingLevel;

  @IsBoolean()
  fever!: boolean;

  @IsEnum(WoundCondition)
  wound_condition!: WoundCondition;

  @IsBoolean()
  headache_severe!: boolean;

  @IsEnum(MoodFlag)
  mood_flag!: MoodFlag;

  @IsOptional()
  @IsUUID()
  client_uuid?: string;
}
