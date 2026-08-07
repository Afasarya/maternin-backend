import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { SupportSessionStatus } from '../common/constants/index.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { SupportSessionsService } from './support-sessions.service.js';
class CreateDto {
  @IsUUID() pregnancy_profile_id!: string;
}
class QueryDto {
  @IsUUID() pregnancy_profile_id!: string;
  @IsOptional() @IsEnum(SupportSessionStatus) status?: SupportSessionStatus;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsInt() @Min(0) offset = 0;
}
class StatusDto {
  @IsEnum(SupportSessionStatus) status!: SupportSessionStatus;
}
@Controller('support-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupportSessionsController {
  constructor(private readonly service: SupportSessionsService) {}
  @Post() @Roles('ibu_hamil') create(
    @Body() dto: CreateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.create(dto.pregnancy_profile_id, user);
  }
  @Get() @Roles('ibu_hamil', 'bidan', 'admin') findAll(
    @Query() q: QueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.findAll(
      q.pregnancy_profile_id,
      q.status,
      q.limit,
      q.offset,
      user,
    );
  }
  @Get(':id') @Roles('ibu_hamil', 'bidan', 'admin') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.findOne(id, user);
  }
  @Patch(':id/status') @Roles('ibu_hamil', 'bidan', 'admin') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.update(id, dto.status, user);
  }
}
