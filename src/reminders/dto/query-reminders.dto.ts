import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ReminderStatus, ReminderType } from '../../common/constants/index.js';

export class QueryRemindersDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsOptional()
  @IsEnum(ReminderType)
  reminder_type?: ReminderType;

  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
