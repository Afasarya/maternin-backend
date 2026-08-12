import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

describe('ReportsController', () => {
  const puskesmasId = '11111111-1111-4111-8111-111111111111';
  const requester = {
    id: '22222222-2222-4222-8222-222222222222',
    role: UserRole.BIDAN,
    puskesmas_id: puskesmasId,
  };
  const report = {
    report_period: {
      month: 7,
      year: 2026,
      puskesmas_name: 'Puskesmas Halmahera',
    },
    summary: {
      total_pregnant: 0,
      total_nifas: 0,
      total_selesai: 0,
      new_registrations: 0,
      total_anc_visits: 0,
      total_symptom_checkins: 0,
    },
    risk_distribution: {
      merah: { count: 0, patients: [] },
      kuning: { count: 0, patients: [] },
      hijau: { count: 0, patients: [] },
    },
    high_risk_details: [],
    postpartum_summary: {
      total_nifas_active: 0,
      red_flags_triggered: 0,
      mental_health_flags: 0,
    },
    notification_summary: {
      total_sent: 0,
      total_failed: 0,
      channels: { wa_patient: 0, wa_bidan: 0, wa_family: 0, in_app: 0 },
    },
    generated_at: new Date('2026-07-30T10:00:00.000Z'),
  };
  const reportsService = {
    generateMonthlyReport: jest.fn(),
    exportMonthlyCsv: jest.fn(),
  };
  let authenticatedUser: CurrentUserData = requester;
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        RolesGuard,
        { provide: ReportsService, useValue: reportsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().user = authenticatedUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    authenticatedUser = requester;
    reportsService.generateMonthlyReport.mockResolvedValue(report);
    reportsService.exportMonthlyCsv.mockResolvedValue(
      '\uFEFF"metric","value"\r\n"total","1"',
    );
  });

  it('routes a transformed monthly report query', async () => {
    await request(app.getHttpServer())
      .get(`/reports/monthly?month=7&year=2026&puskesmas_id=${puskesmasId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          ...report,
          generated_at: '2026-07-30T10:00:00.000Z',
        });
      });

    expect(reportsService.generateMonthlyReport).toHaveBeenCalledWith(
      requester,
      { month: 7, year: 2026, puskesmas_id: puskesmasId },
    );
  });

  it('passes an empty query so the service can apply UTC defaults', async () => {
    await request(app.getHttpServer()).get('/reports/monthly').expect(200);

    expect(reportsService.generateMonthlyReport).toHaveBeenCalledWith(
      requester,
      {},
    );
  });

  it('rejects invalid and unknown query parameters', async () => {
    await request(app.getHttpServer())
      .get('/reports/monthly?month=0')
      .expect(400);
    await request(app.getHttpServer())
      .get('/reports/monthly?month=13')
      .expect(400);
    await request(app.getHttpServer())
      .get('/reports/monthly?month=7.5')
      .expect(400);
    await request(app.getHttpServer())
      .get('/reports/monthly?year=2019')
      .expect(400);
    await request(app.getHttpServer())
      .get('/reports/monthly?puskesmas_id=invalid')
      .expect(400);
    await request(app.getHttpServer())
      .get('/reports/monthly?unknown=true')
      .expect(400);

    expect(reportsService.generateMonthlyReport).not.toHaveBeenCalled();
  });

  it('allows only bidan and admin at controller level', () => {
    expect(Reflect.getMetadata('roles', ReportsController)).toEqual([
      'bidan',
      'admin',
    ]);
  });

  it.each([UserRole.IBU_HAMIL, UserRole.KADER])('rejects %s', async (role) => {
    authenticatedUser = { ...requester, role };

    await request(app.getHttpServer()).get('/reports/monthly').expect(403);
    expect(reportsService.generateMonthlyReport).not.toHaveBeenCalled();
  });

  it('allows admin with a global report query', async () => {
    authenticatedUser = {
      ...requester,
      role: UserRole.ADMIN,
      puskesmas_id: null,
    };

    await request(app.getHttpServer()).get('/reports/monthly').expect(200);
    expect(reportsService.generateMonthlyReport).toHaveBeenCalledWith(
      authenticatedUser,
      {},
    );
  });

  it('exports CSV with safe attachment headers', async () => {
    await request(app.getHttpServer())
      .get('/reports/monthly/export?month=8&year=2026')
      .expect('Content-Type', /text\/csv/)
      .expect(
        'Content-Disposition',
        'attachment; filename="maternin-report-2026-08.csv"',
      )
      .expect(200);
    expect(reportsService.exportMonthlyCsv).toHaveBeenCalledWith(requester, {
      month: 8,
      year: 2026,
    });
  });
});
