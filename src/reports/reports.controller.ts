import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('monthly/export')
  async exportMonthly(
    @CurrentUser() requester: CurrentUserData,
    @Query() query: ReportQueryDto,
    @Res() response: Response,
  ) {
    const csv = await this.reportsService.exportMonthlyCsv(requester, query);
    const month = query.month ?? new Date().getUTCMonth() + 1;
    const year = query.year ?? new Date().getUTCFullYear();
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="maternin-report-${year}-${String(month).padStart(2, '0')}.csv"`,
    );
    response.send(csv);
  }
}
