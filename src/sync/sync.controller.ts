import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { SyncBatchDto } from './dto/sync-batch.dto.js';
import { SyncStatusQueryDto } from './dto/sync-status-query.dto.js';
import { SyncService } from './sync.service.js';

@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('kader')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('batch')
  async processBatch(
    @Body() dto: SyncBatchDto,
    @CurrentUser() requester: CurrentUserData,
    @Headers('x-request-id') requestId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.syncService.processBatch(
      dto,
      requester,
      requestId,
    );

    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.data;
  }

  @Get('status')
  getDeviceStatus(@Query() query: SyncStatusQueryDto) {
    return this.syncService.getDeviceStatus(query.device_uuid);
  }
}
