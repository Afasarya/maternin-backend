import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreateSymptomCheckinDto } from './dto/create-symptom-checkin.dto.js';
import { QuerySymptomCheckinsDto } from './dto/query-symptom-checkins.dto.js';
import { SymptomCheckinsService } from './symptom-checkins.service.js';

@Controller('symptom-checkins')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SymptomCheckinsController {
  constructor(
    private readonly symptomCheckinsService: SymptomCheckinsService,
  ) {}

  @Post()
  @Roles('ibu_hamil', 'kader')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async create(
    @Body() dto: CreateSymptomCheckinDto,
    @CurrentUser() requester: CurrentUserData,
    @Headers('x-request-id') requestId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.symptomCheckinsService.create(
      dto,
      requester,
      requestId,
    );

    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.data;
  }

  @Get()
  @Roles('ibu_hamil', 'bidan', 'admin')
  findByProfile(
    @Query() query: QuerySymptomCheckinsDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.symptomCheckinsService.findByProfile(
      query.pregnancy_profile_id,
      query,
      requester,
    );
  }

  @Get(':id')
  @Roles('ibu_hamil', 'bidan', 'admin')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.symptomCheckinsService.findOne(id, requester);
  }
}
