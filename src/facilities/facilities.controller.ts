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
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreatePuskesmasDto } from './dto/create-puskesmas.dto.js';
import { QueryNearbyDto } from './dto/query-nearby.dto.js';
import { QueryPuskesmasDto } from './dto/query-puskesmas.dto.js';
import { UpdatePuskesmasDto } from './dto/update-puskesmas.dto.js';
import { FacilitiesService } from './facilities.service.js';

@Controller('facilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Post('puskesmas')
  @Roles('admin')
  create(@Body() dto: CreatePuskesmasDto) {
    return this.facilitiesService.create(dto);
  }

  @Get('puskesmas')
  findAll(@Query() query: QueryPuskesmasDto) {
    return this.facilitiesService.findAll(query);
  }

  @Get('puskesmas/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.facilitiesService.findOne(id);
  }

  @Patch('puskesmas/:id')
  @Roles('admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePuskesmasDto,
  ) {
    return this.facilitiesService.update(id, dto);
  }

  @Delete('puskesmas/:id')
  @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.facilitiesService.remove(id);
  }

  @Get('nearby')
  @Roles('ibu_hamil')
  findNearby(@Query() query: QueryNearbyDto) {
    return this.facilitiesService.findNearby(query);
  }
}
