import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class CreatePuskesmasDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsString()
  @IsNotEmpty()
  wilayah_kerja: string;
}
