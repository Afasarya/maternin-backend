import { ServiceUnavailableException } from '@nestjs/common';

export class AiServiceUnavailableException extends ServiceUnavailableException {
  constructor(
    message = 'AI Service sedang tidak tersedia',
    public readonly retryable = true,
    public readonly errorCode = 'AI_SERVICE_UNAVAILABLE',
  ) {
    super(message);
  }
}
