import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { BidanService } from './bidan.service.js';
import { QueryPatientsDto } from './dto/query-patients.dto.js';

@Controller('bidan')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('bidan', 'admin')
export class BidanController {
  constructor(private readonly bidanService: BidanService) {}

  @Get('patients')
  getPatients(
    @CurrentUser() requester: CurrentUserData,
    @Query() query: QueryPatientsDto,
  ) {
    return this.bidanService.getPatients(requester, query);
  }

  @Get('patients/:id/visit-brief')
  getVisitBrief(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.bidanService.getVisitBrief(id, requester);
  }

  @Get('statistics')
  getStatistics(@CurrentUser() requester: CurrentUserData) {
    return this.bidanService.getStatistics(requester);
  }
}
