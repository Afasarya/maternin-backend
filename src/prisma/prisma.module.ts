import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * PrismaModule — @Global() so every module in the app can inject PrismaService
 * without having to import PrismaModule explicitly.
 *
 * Registered once in AppModule; available everywhere.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
