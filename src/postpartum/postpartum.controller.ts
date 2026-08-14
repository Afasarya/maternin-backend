import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreatePostpartumLogDto } from './dto/create-postpartum-log.dto.js';
import { PostpartumFlagCallbackDto } from './dto/postpartum-flag-callback.dto.js';
import { QueryPostpartumLogsDto } from './dto/query-postpartum-logs.dto.js';
import { PostpartumService } from './postpartum.service.js';

@Controller()
export class PostpartumController {
  constructor(private readonly postpartumService: PostpartumService) {}

  @Post('postpartum-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ibu_hamil', 'kader')
  async create(
    @Body() dto: CreatePostpartumLogDto,
    @CurrentUser() requester: CurrentUserData,
    @Headers('x-request-id') requestId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.postpartumService.create(
      dto,
      requester,
      requestId,
    );

    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.data;
  }

  @Post('internal/postpartum-flags')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  updateFlags(@Body() dto: PostpartumFlagCallbackDto) {
    return this.postpartumService.updateFlags(dto);
  }

  @Get('postpartum-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ibu_hamil', 'bidan', 'kader', 'admin')
  findByProfile(
    @Query() query: QueryPostpartumLogsDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.postpartumService.findByProfile(
      query.pregnancy_profile_id,
      query,
      requester,
    );
  }

  @Get('postpartum-logs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ibu_hamil', 'bidan', 'kader', 'admin')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.postpartumService.findOne(id, requester);
  }
}
