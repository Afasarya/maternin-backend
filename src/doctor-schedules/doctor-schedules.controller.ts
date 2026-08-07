import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DayOfWeek } from '../common/constants/index.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { DoctorsService } from '../doctors/doctors.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
class ScheduleDto {
  @IsEnum(DayOfWeek) day_of_week!: DayOfWeek;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) start_time!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) end_time!: string;
}
class ReplaceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  schedules!: ScheduleDto[];
}
@Controller('doctor/schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dokter')
export class DoctorSchedulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly doctors: DoctorsService,
  ) {}
  @Get() async get(@CurrentUser() user: CurrentUserData) {
    const doctor = await this.doctors.findByUser(user.id);
    return this.prisma.doctorSchedule.findMany({
      where: { doctor_id: doctor.id },
      orderBy: { day_of_week: 'asc' },
    });
  }
  @Put() async replace(
    @Body() dto: ReplaceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (dto.schedules.some((x) => x.start_time >= x.end_time))
      throw new BadRequestException('start_time harus sebelum end_time');
    const doctor = await this.doctors.findByUser(user.id);
    return this.prisma.$transaction(async (tx) => {
      await tx.doctorSchedule.deleteMany({ where: { doctor_id: doctor.id } });
      await tx.doctorSchedule.createMany({
        data: dto.schedules.map((x) => ({ ...x, doctor_id: doctor.id })),
      });
      return tx.doctorSchedule.findMany({ where: { doctor_id: doctor.id } });
    });
  }
}
