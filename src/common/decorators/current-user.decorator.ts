import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '../constants/index.js';

export interface CurrentUserData {
  id: string;
  role: UserRole;
  puskesmas_id: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserData | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserData }>();

    return request.user;
  },
);
