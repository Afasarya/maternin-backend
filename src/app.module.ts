import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import * as Joi from 'joi';
import { AncRecordsModule } from './anc-records/anc-records.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BidanModule } from './bidan/bidan.module.js';
import { ChatModule } from './chat/chat.module.js';
import { ConsultationsModule } from './consultations/consultations.module.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { DoctorSchedulesModule } from './doctor-schedules/doctor-schedules.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { SupportSessionsModule } from './support-sessions/support-sessions.module.js';
import { FacilitiesModule } from './facilities/facilities.module.js';
import { FamilyCircleModule } from './family-circle/family-circle.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { NutritionModule } from './nutrition/nutrition.module.js';
import { PostpartumModule } from './postpartum/postpartum.module.js';
import { PregnancyProfilesModule } from './pregnancy-profiles/pregnancy-profiles.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RiskAssessmentsModule } from './risk-assessments/risk-assessments.module.js';
import { SymptomCheckinsModule } from './symptom-checkins/symptom-checkins.module.js';
import { SyncModule } from './sync/sync.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // ─── Environment validation (PRD section 9 & 10.1) ───
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(30),
        INTERNAL_SERVICE_TOKEN: Joi.string().min(32).required(),
        AI_INTERNAL_SERVICE_TOKEN: Joi.string().min(32).optional(),
        FONNTE_API_KEY: Joi.string().required(),
        FONNTE_WEBHOOK_URL: Joi.string().uri().optional(),
        FONNTE_WEBHOOK_TOKEN: Joi.string().min(16).required(),
        NUTRITION_PROMPT_WINDOW_HOURS: Joi.number().integer().positive().default(6),
        AI_SERVICE_URL: Joi.string().uri().required(),
        NOMINATIM_BASE_URL: Joi.string()
          .uri()
          .default('https://nominatim.openstreetmap.org'),
        XENDIT_SECRET_KEY: Joi.string().required(),
        XENDIT_WEBHOOK_TOKEN: Joi.string().required(),
        CONSULTATION_PLATFORM_FEE: Joi.number().min(0).required(),
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
    AdminModule,
    UsersModule,

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

    // ─── Family notification contacts ───
    FamilyCircleModule,

    // ─── Dynamic ANC & postpartum reminder scheduler ───
    RemindersModule,

    // ─── Queued Fonnte WhatsApp delivery & notification history ───
    NotificationsModule,

    NutritionModule,

    // ─── Bidan patient monitoring dashboard ───
    BidanModule,

    // ─── Kader offline batch synchronization ───
    SyncModule,

    // ─── AI chatbot proxy & chronological message history ───
    ChatModule,

    // ─── Basic consultation session management ───
    ConsultationsModule,
    SupportSessionsModule,
    DoctorsModule,
    DoctorSchedulesModule,
    PaymentsModule,

    // ─── Monthly MDSR operational report export ───
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
