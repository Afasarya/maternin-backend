import {
  Controller,
  Get,
  Headers,
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
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { RiskBadge } from '../common/constants/index.js';

class QueryAlertsDto {
  @IsOptional()
  @IsEnum(RiskBadge)
  risk_badge?: RiskBadge;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

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

  @Get('patients/:id')
  getPatientDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.bidanService.getPatientDetail(id, requester);
  }

  @Get('patients/:id/visit-brief')
  getVisitBrief(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
    @Headers('x-request-id') requestId: string,
  ) {
    return this.bidanService.getVisitBrief(id, requester, requestId);
  }

  @Get('statistics')
  getStatistics(@CurrentUser() requester: CurrentUserData) {
    return this.bidanService.getStatistics(requester);
  }

  @Get('alerts')
  getAlerts(
    @CurrentUser() requester: CurrentUserData,
    @Query() query: QueryAlertsDto,
  ) {
    return this.bidanService.getAlerts(requester, query);
  }
}
