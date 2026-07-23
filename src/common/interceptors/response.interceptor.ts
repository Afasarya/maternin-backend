import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Response } from 'express';

/**
 * Wraps all successful responses in a consistent envelope:
 * { status_code, message: 'success', data }
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        const httpContext = context.switchToHttp();
        const response = httpContext.getResponse<Response>();
        const statusCode = response.statusCode;

        return {
          status_code: statusCode,
          message: 'success',
          data,
        };
      }),
    );
  }
}
