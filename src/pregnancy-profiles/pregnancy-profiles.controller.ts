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
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreatePregnancyProfileDto } from './dto/create-pregnancy-profile.dto.js';
import { QueryPregnancyProfilesDto } from './dto/query-pregnancy-profiles.dto.js';
import { UpdatePregnancyProfileDto } from './dto/update-pregnancy-profile.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { PregnancyProfilesService } from './pregnancy-profiles.service.js';

@Controller('pregnancy-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PregnancyProfilesController {
  constructor(
    private readonly pregnancyProfilesService: PregnancyProfilesService,
  ) {}

  @Post()
  @Roles('ibu_hamil', 'bidan', 'kader')
  create(
    @Body() dto: CreatePregnancyProfileDto,
    @CurrentUser() creator: CurrentUserData,
  ) {
    return this.pregnancyProfilesService.create(
      dto,
      creator.id,
      creator.role,
      creator.puskesmas_id,
    );
  }

  @Get()
  @Roles('ibu_hamil', 'bidan', 'admin')
  findAll(
    @CurrentUser() requester: CurrentUserData,
    @Query() query: QueryPregnancyProfilesDto,
  ) {
    return this.pregnancyProfilesService.findAll(
      requester.id,
      requester.role,
      requester.puskesmas_id,
      query,
    );
  }

  @Get(':id')
  @Roles('ibu_hamil', 'bidan', 'admin')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.pregnancyProfilesService.findOne(id, requester);
  }

  @Patch(':id')
  @Roles('ibu_hamil', 'bidan', 'admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePregnancyProfileDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.pregnancyProfilesService.update(id, dto, requester);
  }

  @Patch(':id/status')
  @Roles('bidan', 'kader')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.pregnancyProfilesService.updateStatus(id, dto, requester);
  }
}
