import {
  IsEmail,
  IsEnum,
  IsPhoneNumber,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../common/constants/index.js';

export class RegisterDto {
  @IsString()
  full_name: string;

  @IsPhoneNumber()
  phone_number: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf(
    (dto: RegisterDto, value: unknown) =>
      value !== undefined ||
      dto.role === UserRole.BIDAN ||
      dto.role === UserRole.KADER,
  )
  @IsUUID()
  puskesmas_id?: string;
}
