import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly internalToken: string;

  constructor(configService: ConfigService) {
    this.internalToken = configService.getOrThrow<string>(
      'INTERNAL_SERVICE_TOKEN',
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const suppliedToken = request.get('X-Internal-Token');

    if (!suppliedToken || !this.matchesToken(suppliedToken)) {
      throw new UnauthorizedException('Token internal tidak valid');
    }

    return true;
  }

  private matchesToken(suppliedToken: string): boolean {
    const expected = Buffer.from(this.internalToken);
    const supplied = Buffer.from(suppliedToken);

    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  }
}
