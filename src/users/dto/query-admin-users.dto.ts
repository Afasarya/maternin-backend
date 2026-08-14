import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserRole } from '../../common/constants/index.js';

export enum UserSort {
  FULL_NAME = 'full_name',
  CREATED_AT = 'created_at',
}
export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}
export class QueryAdminUsersDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsUUID() puskesmas_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @IsEnum(UserSort) sort: UserSort = UserSort.CREATED_AT;
  @IsOptional() @IsEnum(SortDirection) direction: SortDirection =
    SortDirection.DESC;
}
