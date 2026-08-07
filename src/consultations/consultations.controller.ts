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
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ConsultationStatus } from '../common/constants/index.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ConsultationsService } from './consultations.service.js';
class CreateDto {
  @IsUUID() pregnancy_profile_id!: string;
  @IsUUID() doctor_id!: string;
  @IsDateString() scheduled_at!: string;
}
class MessageDto {
  @IsString() @MinLength(1) message!: string;
}
class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsultationsController {
  constructor(private readonly service: ConsultationsService) {}
  @Post('consultations') @Roles('ibu_hamil') create(
    @Body() dto: CreateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.create(dto, user);
  }
  @Get('consultations') @Roles('ibu_hamil') list(
    @Query('status') status: ConsultationStatus | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.listPatient(status, user);
  }
  @Get('consultations/:id') @Roles('ibu_hamil', 'dokter') detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.detail(id, user);
  }
  @Patch('consultations/:id/cancel') @Roles('ibu_hamil') cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.cancel(id, user);
  }
  @Patch('consultations/:id/complete') @Roles('dokter') complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.complete(id, user);
  }
  @Get('consultations/:id/messages') @Roles('ibu_hamil', 'dokter') messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.messages(id, q.limit, q.offset, user);
  }
  @Post('consultations/:id/messages') @Roles('ibu_hamil', 'dokter') send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.send(id, dto.message, user);
  }
  @Get('doctor/consultations') @Roles('dokter') doctor(
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.listDoctor(user);
  }
  @Get('admin/consultations') @Roles('admin') admin() {
    return this.service.listAdmin();
  }
}
