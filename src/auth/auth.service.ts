import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { User } from '../../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

type AuthUser = Pick<User, 'id' | 'full_name' | 'phone_number' | 'role'>;
type TokenUser = Pick<User, 'id' | 'role' | 'puskesmas_id'>;

interface PrismaKnownRequestError {
  code: string;
  clientVersion: string;
}

const isPrismaKnownRequestError = (
  error: unknown,
): error is PrismaKnownRequestError => {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & Partial<PrismaKnownRequestError>;

  return (
    typeof candidate.code === 'string' &&
    typeof candidate.clientVersion === 'string'
  );
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByPhone(dto.phone_number);

    if (existingUser) {
      throw new ConflictException('Nomor telepon sudah terdaftar');
    }

    const password_hash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.usersService.create({
        full_name: dto.full_name,
        phone_number: dto.phone_number,
        password_hash,
        role: dto.role,
        email: dto.email,
        puskesmas_id: dto.puskesmas_id,
      });

      return this.buildAuthResponse(user);
    } catch (error: unknown) {
      if (isPrismaKnownRequestError(error)) {
        if (error.code === 'P2002') {
          throw new ConflictException('Nomor telepon sudah terdaftar');
        }

        if (error.code === 'P2003') {
          throw new BadRequestException('Puskesmas tidak ditemukan');
        }
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByPhone(dto.phone_number);

    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new UnauthorizedException('Nomor telepon atau password salah');
    }

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User) {
    return {
      user: this.toAuthUser(user),
      access_token: await this.generateToken(user),
    };
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      full_name: user.full_name,
      phone_number: user.phone_number,
      role: user.role,
    };
  }

  private generateToken(user: TokenUser) {
    return this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      puskesmas_id: user.puskesmas_id,
    });
  }
}
