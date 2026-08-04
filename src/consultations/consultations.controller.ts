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
import { ConsultationsService } from './consultations.service.js';
import { CreateConsultationDto } from './dto/create-consultation.dto.js';
import { QueryConsultationsDto } from './dto/query-consultations.dto.js';
import { UpdateConsultationStatusDto } from './dto/update-consultation-status.dto.js';

@Controller('consultations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  @Roles('ibu_hamil')
  create(
    @Body() dto: CreateConsultationDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.consultationsService.create(dto, requester);
  }

  @Get()
  @Roles('ibu_hamil', 'bidan', 'admin')
  findByProfile(
    @Query() query: QueryConsultationsDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.consultationsService.findByProfile(
      query.pregnancy_profile_id,
      query,
      requester,
    );
  }

  @Get(':id')
  @Roles('ibu_hamil', 'bidan', 'admin')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.consultationsService.findOne(id, requester);
  }

  @Patch(':id/status')
  @Roles('ibu_hamil', 'bidan', 'admin')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConsultationStatusDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.consultationsService.updateStatus(id, dto.status, requester);
  }
}
