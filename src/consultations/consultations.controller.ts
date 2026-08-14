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
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ConsultationStatus } from '../common/constants/index.js';
import { PaymentStatus } from '../common/constants/index.js';
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
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(100) topic!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(2000) complaint!: string;
}
class MessageDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(2000) message!: string;
}
class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}
class DoctorConsultationsQueryDto extends PageDto {
  @IsOptional() @IsEnum(ConsultationStatus) status?: ConsultationStatus;
  @IsOptional() @IsDateString() date_from?: string;
  @IsOptional() @IsDateString() date_to?: string;
}
class AdminConsultationsQueryDto extends DoctorConsultationsQueryDto {
  @IsOptional() @IsUUID() doctor_id?: string;
  @IsOptional() @IsEnum(PaymentStatus) payment_status?: PaymentStatus;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
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
  @Get('consultations/:id/payment-status') @Roles('ibu_hamil') paymentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.paymentStatus(id, user);
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
    @Query() query: DoctorConsultationsQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.listDoctor(user, query);
  }
  @Get('admin/consultations')
  @Roles('admin')
  admin(@Query() query: AdminConsultationsQueryDto) {
    return this.service.listAdmin(query);
  }

  @Get('admin/consultations/:id')
  @Roles('admin')
  adminDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminDetail(id);
  }
}
