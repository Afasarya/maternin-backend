import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { User } from '../../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole } from '../common/constants/index.js';

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
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
        role: UserRole.IBU_HAMIL,
        email: dto.email,
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

    if (
      !user ||
      !user.is_active ||
      !(await bcrypt.compare(dto.password, user.password_hash))
    ) {
      throw new UnauthorizedException('Nomor telepon atau password salah');
    }

    return this.buildAuthResponse(user);
  }

  async refresh(token: string) {
    const hash = this.hashToken(token);
    const session = await this.prisma.refreshSession.findUnique({
      where: { token_hash: hash },
      include: { user: true },
    });
    if (
      !session ||
      session.expires_at <= new Date() ||
      !session.user.is_active
    ) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }
    if (session.revoked_at) {
      await this.prisma.refreshSession.updateMany({
        where: { family_id: session.family_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      throw new UnauthorizedException('Reuse refresh token terdeteksi');
    }
    return this.prisma.$transaction(async (tx) => {
      const raw = this.newRefreshToken();
      const replacement = await tx.refreshSession.create({
        data: {
          user_id: session.user_id,
          family_id: session.family_id,
          token_hash: this.hashToken(raw),
          expires_at: this.refreshExpiry(),
        },
      });
      const rotated = await tx.refreshSession.updateMany({
        where: { id: session.id, revoked_at: null },
        data: { revoked_at: new Date(), replaced_by_id: replacement.id },
      });
      if (rotated.count !== 1)
        throw new UnauthorizedException('Refresh token sudah digunakan');
      return {
        access_token: await this.generateToken(session.user),
        refresh_token: raw,
        expires_in: this.accessExpiresSeconds(),
      };
    });
  }

  async logout(token: string) {
    const session = await this.prisma.refreshSession.findUnique({
      where: { token_hash: this.hashToken(token) },
    });
    if (!session) throw new UnauthorizedException('Refresh token tidak valid');
    await this.prisma.refreshSession.updateMany({
      where: { family_id: session.family_id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async buildAuthResponse(user: User) {
    const refreshToken = this.newRefreshToken();
    await this.prisma.refreshSession.create({
      data: {
        user_id: user.id,
        family_id: randomUUID(),
        token_hash: this.hashToken(refreshToken),
        expires_at: this.refreshExpiry(),
      },
    });
    return {
      user: this.toAuthUser(user),
      access_token: await this.generateToken(user),
      refresh_token: refreshToken,
      expires_in: this.accessExpiresSeconds(),
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

  private newRefreshToken() {
    return randomBytes(48).toString('base64url');
  }
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private refreshExpiry() {
    return new Date(
      Date.now() +
        this.config.get<number>('REFRESH_TOKEN_TTL_DAYS', 30) * 86_400_000,
    );
  }
  private accessExpiresSeconds() {
    const value = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 900;
    return (
      Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[match[2]] ?? 1)
    );
  }
}
