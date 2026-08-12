import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class PostpartumFlagCallbackDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsOptional()
  @IsUUID()
  postpartum_log_id?: string;

  @IsBoolean()
  red_flag_triggered!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  mental_health_flag?: boolean;
}
