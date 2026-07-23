import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus() {
    return {
      app: 'MaternIn Backend',
      version: '1.0.0',
      status: 'running',
    };
  }
}
