import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto.js';
import { UsersService } from './users.service.js';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Query() query: QueryAdminUsersDto) {
    return this.users.getAdminUsers(query);
  }
}