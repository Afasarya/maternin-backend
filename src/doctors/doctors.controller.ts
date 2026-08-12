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
  IsInt, Max, IsEnum, MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
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
  @IsOptional() @IsString() full_name?: string;
  @IsOptional() @IsString() phone_number?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() specialization?: string;
  @IsOptional() @IsString() str_number?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
enum DoctorSort { FULL_NAME = 'full_name', PRICE = 'price', CREATED_AT = 'created_at' }
enum Direction { ASC = 'asc', DESC = 'desc' }
class QueryDoctorsDto {
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(100) specialization?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() is_active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @IsEnum(DoctorSort) sort: DoctorSort = DoctorSort.CREATED_AT;
  @IsOptional() @IsEnum(Direction) direction: Direction = Direction.DESC;
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
  @Get('admin/doctors') @Roles('admin') adminFindAll(@Query() query: QueryDoctorsDto) {
    return this.service.findAllAdmin(query);
  }
  @Patch('admin/doctors/:id') @Roles('admin') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDoctorDto,
  ) {
    return this.service.update(id, dto);
  }
}
