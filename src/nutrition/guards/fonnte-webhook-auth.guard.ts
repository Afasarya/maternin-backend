import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Injectable()
export class FonnteWebhookAuthGuard implements CanActivate {
  private readonly token: string;
  constructor(config: ConfigService) { this.token = config.getOrThrow<string>('FONNTE_WEBHOOK_TOKEN'); }
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const queryToken = typeof request.query.token === 'string'
      ? request.query.token
      : '';
    const supplied = request.get('X-Fonnte-Token') ?? queryToken;
    const actual = Buffer.from(supplied);
    const expected = Buffer.from(this.token);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException('Token webhook Fonnte tidak valid');
    return true;
  }
}