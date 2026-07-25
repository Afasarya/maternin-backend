import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import * as Joi from 'joi';
import { AncRecordsModule } from './anc-records/anc-records.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { FacilitiesModule } from './facilities/facilities.module.js';
import { PostpartumModule } from './postpartum/postpartum.module.js';
import { PregnancyProfilesModule } from './pregnancy-profiles/pregnancy-profiles.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RiskAssessmentsModule } from './risk-assessments/risk-assessments.module.js';
import { SymptomCheckinsModule } from './symptom-checkins/symptom-checkins.module.js';

@Module({
  imports: [
    // ─── Environment validation (PRD section 9 & 10.1) ───
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        INTERNAL_SERVICE_TOKEN: Joi.string().min(32).required(),
        FONNTE_API_KEY: Joi.string().required(),
        AI_SERVICE_URL: Joi.string().uri().required(),
        NOMINATIM_BASE_URL: Joi.string()
          .uri()
          .default('https://nominatim.openstreetmap.org'),
      }),
    }),

    // ─── Prisma (PostgreSQL ORM — PRD section 1) ───
    // @Global() module — PrismaService available everywhere via DI
    PrismaModule,

    // ─── Rate limiting (PRD section 10.4) ───
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000, // 60 seconds window
          limit: 30, // 30 requests per window
        },
      ],
    }),

    // ─── BullMQ via Redis (PRD section 1 — for reminders & notifications) ───
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
        },
      }),
    }),

    // ─── HTTP module for AI Service & Fonnte calls ───
    HttpModule,

    // ─── Authentication & authorization foundation ───
    AuthModule,

    // ─── Puskesmas CRUD & nearby facilities proxy ───
    FacilitiesModule,

    // ─── Pregnancy profile lifecycle ───
    PregnancyProfilesModule,

    // ─── Antenatal care records ───
    AncRecordsModule,

    // ─── Symptom screening & AI triage ───
    SymptomCheckinsModule,

    // ─── Risk assessment history & internal AI callback ───
    RiskAssessmentsModule,

    // ─── Structured postpartum check-ins & red-flag evaluation ───
    PostpartumModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
