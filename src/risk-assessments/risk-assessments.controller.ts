import {
  Body,
  Controller,
  Get,
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
import { CreateRiskAssessmentInternalDto } from './dto/create-risk-assessment-internal.dto.js';
import { QueryLatestRiskAssessmentDto } from './dto/query-latest-risk-assessment.dto.js';
import { QueryRiskAssessmentsDto } from './dto/query-risk-assessments.dto.js';
import { RiskAssessmentsService } from './risk-assessments.service.js';

@Controller()
export class RiskAssessmentsController {
  constructor(
    private readonly riskAssessmentsService: RiskAssessmentsService,
  ) {}

  @Post('internal/risk-assessments')
  @UseGuards(InternalAuthGuard)
  async createFromCallback(
    @Body() dto: CreateRiskAssessmentInternalDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.riskAssessmentsService.createFromCallback(dto);

    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.assessment;
  }

  @Get('pregnancy-profiles/:id/risk-assessments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ibu_hamil', 'bidan', 'admin')
  findByProfile(
    @Param('id', ParseUUIDPipe) profileId: string,
    @Query() query: QueryRiskAssessmentsDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.riskAssessmentsService.findByProfile(
      profileId,
      query,
      requester,
    );
  }

  @Get('risk-assessments/latest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ibu_hamil', 'bidan', 'admin')
  findLatest(
    @Query() query: QueryLatestRiskAssessmentDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.riskAssessmentsService.findLatest(
      query.pregnancy_profile_id,
      requester,
    );
  }

  @Get('risk-assessments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ibu_hamil', 'bidan', 'admin')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.riskAssessmentsService.findOne(id, requester);
  }
}
