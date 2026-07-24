import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateAncRecordDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsOptional()
  @IsInt()
  systolic?: number;

  @IsOptional()
  @IsInt()
  diastolic?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  weight_kg?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  fundal_height_cm?: number;

  @IsOptional()
  @IsString()
  protein_urine?: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  platelet_count?: number;

  @IsOptional()
  @IsDateString()
  recorded_at?: string;

  @IsOptional()
  @IsUUID()
  client_uuid?: string;
}
