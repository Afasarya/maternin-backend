import { ServiceUnavailableException } from '@nestjs/common';

export class AiServiceUnavailableException extends ServiceUnavailableException {
  constructor(message = 'AI Service sedang tidak tersedia') {
    super(message);
  }
}
