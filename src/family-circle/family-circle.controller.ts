import {
  Body,
  Controller,
  Delete,
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
import { CreateFamilyCircleDto } from './dto/create-family-circle.dto.js';
import { QueryFamilyCircleDto } from './dto/query-family-circle.dto.js';
import { UpdateFamilyCircleDto } from './dto/update-family-circle.dto.js';
import { FamilyCircleService } from './family-circle.service.js';

@Controller('family-circle')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FamilyCircleController {
  constructor(private readonly familyCircleService: FamilyCircleService) {}

  @Post()
  @Roles('ibu_hamil')
  create(
    @Body() dto: CreateFamilyCircleDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.familyCircleService.create(dto, requester);
  }

  @Get()
  @Roles('ibu_hamil', 'bidan', 'admin')
  findByProfile(
    @Query() query: QueryFamilyCircleDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.familyCircleService.findByProfile(
      query.pregnancy_profile_id,
      query,
      requester,
    );
  }

  @Get(':id')
  @Roles('ibu_hamil', 'admin')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.familyCircleService.findOne(id, requester);
  }

  @Patch(':id')
  @Roles('ibu_hamil')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFamilyCircleDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.familyCircleService.update(id, dto, requester);
  }

  @Delete(':id')
  @Roles('ibu_hamil')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.familyCircleService.remove(id, requester);
  }
}
