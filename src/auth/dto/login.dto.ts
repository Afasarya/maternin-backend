import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import {
  INDONESIA_PHONE_PATTERN,
  normalizeIndonesiaPhone,
} from '../phone-number.util.js';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => normalizeIndonesiaPhone(value))
  @IsString()
  @Matches(INDONESIA_PHONE_PATTERN, {
    message: 'Nomor telepon harus diawali 08, 62, atau +62',
  })
  phone_number!: string;

  @IsString()
  password!: string;
}
