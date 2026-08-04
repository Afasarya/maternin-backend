import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ConsultationStatus } from '../../common/constants/index.js';

export class QueryConsultationsDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

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
