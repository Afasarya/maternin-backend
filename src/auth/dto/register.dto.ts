import { Transform } from 'class-transformer';
import {
  IsEmail,
  Matches,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  INDONESIA_PHONE_PATTERN,
  normalizeIndonesiaPhone,
} from '../phone-number.util.js';

export class RegisterDto {
  @IsString()
  full_name!: string;

  @Transform(({ value }: { value: unknown }) => normalizeIndonesiaPhone(value))
  @Matches(INDONESIA_PHONE_PATTERN, {
    message: 'Nomor telepon harus diawali 08, 62, atau +62',
  })
  phone_number!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEmail()
  email?: string;
}
