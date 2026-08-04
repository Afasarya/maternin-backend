import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('bidan', 'admin')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly')
  getMonthlyReport(
    @CurrentUser() requester: CurrentUserData,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.generateMonthlyReport(requester, query);
  }
}
