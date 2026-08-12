import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AdminService } from './admin.service.js';
import { AdminStatisticsQueryDto } from './dto/admin-statistics-query.dto.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('statistics')
  getStatistics(@Query() query: AdminStatisticsQueryDto) {
    return this.adminService.getStatistics(query);
  }
}