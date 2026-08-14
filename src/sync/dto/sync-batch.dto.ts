import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsString,
  IsUUID,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SyncPayloadType } from '../../common/constants/index.js';

export class SyncRecordDto {
  @IsUUID()
  client_uuid!: string;

  @IsEnum(SyncPayloadType)
  payload_type!: SyncPayloadType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsDateString()
  client_created_at!: string;
}

export class SyncBatchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  device_uuid!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncRecordDto)
  records!: SyncRecordDto[];
}
