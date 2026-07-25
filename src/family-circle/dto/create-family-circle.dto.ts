import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { NotifyOn } from '../../common/constants/index.js';

export class CreateFamilyCircleDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsString()
  @IsNotEmpty()
  contact_name!: string;

  @IsString()
  @IsNotEmpty()
  contact_phone!: string;

  @IsString()
  @IsNotEmpty()
  relation!: string;

  @IsEnum(NotifyOn)
  notify_on!: NotifyOn;
}
