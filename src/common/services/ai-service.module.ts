import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AiServiceClient } from './ai-service.client.js';

@Module({
  imports: [HttpModule],
  providers: [AiServiceClient],
  exports: [AiServiceClient],
})
export class AiServiceModule {}
