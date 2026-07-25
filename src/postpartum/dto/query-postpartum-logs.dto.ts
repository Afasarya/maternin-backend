import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export enum PostpartumLogSort {
  DAY_ASC = 'day_asc',
  CREATED_DESC = 'created_desc',
}

export class QueryPostpartumLogsDto {
  @IsUUID()
  pregnancy_profile_id!: string;

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

  @IsOptional()
  @IsEnum(PostpartumLogSort)
  sort: PostpartumLogSort = PostpartumLogSort.DAY_ASC;
}
