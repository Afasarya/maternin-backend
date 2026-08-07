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
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { DoctorsService } from './doctors.service.js';
class CreateDoctorDto {
  @IsString() full_name!: string;
  @IsString() phone_number!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() specialization!: string;
  @IsOptional() @IsString() str_number?: string;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsString() bio?: string;
}
class UpdateDoctorDto {
  @IsOptional() @IsString() specialization?: string;
  @IsOptional() @IsString() str_number?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(private readonly service: DoctorsService) {}
  @Get('doctors') @Roles('ibu_hamil') findAll(
    @Query('specialization') specialization?: string,
  ) {
    return this.service.findAll(specialization);
  }
  @Get('doctors/:id') @Roles('ibu_hamil') findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(id);
  }
  @Post('admin/doctors') @Roles('admin') create(@Body() dto: CreateDoctorDto) {
    return this.service.create(dto);
  }
  @Patch('admin/doctors/:id') @Roles('admin') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDoctorDto,
  ) {
    return this.service.update(id, dto);
  }
}
