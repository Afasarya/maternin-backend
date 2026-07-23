import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates an X-Request-Id header if not already present.
 * This ID is carried across services for distributed tracing (PRD section 6).
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const requestId =
      (request.headers['x-request-id'] as string) || uuidv4();

    // Attach to request for downstream usage
    request.headers['x-request-id'] = requestId;

    // Echo back in response headers
    response.setHeader('X-Request-Id', requestId);

    return next.handle();
  }
}
