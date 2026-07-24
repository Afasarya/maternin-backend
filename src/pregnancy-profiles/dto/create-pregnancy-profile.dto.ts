import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CreatePregnancyProfileDto {
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'hpht harus menggunakan format YYYY-MM-DD',
  })
  hpht!: string;

  @IsInt()
  @Min(1)
  gravida!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  existing_conditions?: string[];

  @IsOptional()
  @IsBoolean()
  had_preeclampsia_history?: boolean;
}
