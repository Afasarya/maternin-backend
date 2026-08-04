import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsString,
  IsUUID,
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
  device_uuid!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncRecordDto)
  records!: SyncRecordDto[];
}
