import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../../common/constants/index.js';
import { UsersService } from '../../users/users.service.js';
import { UnauthorizedException } from '@nestjs/common';

interface JwtPayload {
  sub: string;
  role: UserRole;
  puskesmas_id: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findAuthUser(payload.sub);
    if (!user?.is_active) throw new UnauthorizedException('User tidak aktif');
    return {
      id: user.id,
      role: user.role,
      puskesmas_id: user.puskesmas_id,
    };
  }
}
