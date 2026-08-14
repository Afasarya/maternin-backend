import { IsDateString, IsOptional } from 'class-validator';

export class AdminStatisticsQueryDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}
