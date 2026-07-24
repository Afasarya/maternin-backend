import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CheckinType } from '../../common/constants/index.js';

export class CreateSymptomCheckinDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsEnum(CheckinType)
  checkin_type!: CheckinType;

  @IsObject()
  answers!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  conjunctiva_image_url?: string;

  @IsOptional()
  @IsUUID()
  client_uuid?: string;
}
