import { Module } from '@nestjs/common';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { DoctorSchedulesController } from './doctor-schedules.controller.js';
@Module({ imports: [DoctorsModule], controllers: [DoctorSchedulesController] })
export class DoctorSchedulesModule {}
