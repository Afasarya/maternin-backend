import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../constants/index.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

interface AuthenticatedUser {
  id: string;
  role: UserRole;
  puskesmas_id: string | null;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<`${UserRole}`[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowedRoles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    if (!request.user || !allowedRoles.includes(request.user.role)) {
      throw new ForbiddenException('Role tidak memiliki akses');
    }

    return true;
  }
}
