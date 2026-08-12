import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ParseNutritionDto {
  @IsUUID()
  pregnancy_profile_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  raw_message!: string;
}
