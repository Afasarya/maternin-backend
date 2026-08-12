import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RiskBadge, UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { BidanController } from './bidan.controller.js';
import { BidanService } from './bidan.service.js';

describe('BidanController', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const requester = {
    id: '22222222-2222-4222-8222-222222222222',
    role: UserRole.BIDAN,
    puskesmas_id: '33333333-3333-4333-8333-333333333333',
  };
  const patientsResult = {
    data: [],
    total: 0,
    limit: 20,
    offset: 0,
  };
  const brief = {
    patient_name: 'Siti Rahmawati',
    gestational_week: 29,
    latest_risk_badge: RiskBadge.KUNING,
    latest_aggregate_score: '60.00',
    vitals_summary: {
      systolic: 130,
      diastolic: 85,
      weight_kg: '62.50',
      fundal_height_cm: null,
      platelet_count: null,
    },
    risk_factors: ['Tekanan darah tinggi'],
    recent_symptoms: ['sakit_kepala: ringan'],
    recommendation: 'Kontrol terjadwal.',
    last_visit_date: '2026-07-25',
  };
  const statistics = {
    total_patients: 3,
    risk_distribution: { merah: 1, kuning: 1, hijau: 1 },
    overdue_checkins: 1,
    nifas_count: 1,
    anc_this_month: 2,
    latest_alerts: [],
  };
  const bidanService = {
    getPatients: jest.fn(),
    getVisitBrief: jest.fn(),
    getStatistics: jest.fn(),
    getPatientDetail: jest.fn(),
    getAlerts: jest.fn(),
  };
  let authenticatedUser: CurrentUserData = requester;
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BidanController],
      providers: [
        RolesGuard,
        { provide: BidanService, useValue: bidanService },
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
    bidanService.getPatients.mockResolvedValue(patientsResult);
    bidanService.getVisitBrief.mockResolvedValue(brief);
    bidanService.getStatistics.mockResolvedValue(statistics);
  });

  it('routes patient filters and transformed pagination', async () => {
    await request(app.getHttpServer())
      .get(
        '/bidan/patients?risk_badge=merah&search=%20Siti%20&limit=10&offset=5',
      )
      .expect(200)
      .expect(patientsResult);

    expect(bidanService.getPatients).toHaveBeenCalledWith(requester, {
      risk_badge: RiskBadge.MERAH,
      search: 'Siti',
      limit: 10,
      offset: 5,
    });
  });

  it('applies patient query defaults', async () => {
    await request(app.getHttpServer())
      .get('/bidan/patients')
      .expect(200)
      .expect(patientsResult);

    expect(bidanService.getPatients).toHaveBeenCalledWith(requester, {
      limit: 20,
      offset: 0,
    });
  });

  it('rejects invalid filters, pagination, and unknown query fields', async () => {
    await request(app.getHttpServer())
      .get('/bidan/patients?risk_badge=ungu')
      .expect(400);
    await request(app.getHttpServer())
      .get('/bidan/patients?limit=101')
      .expect(400);
    await request(app.getHttpServer())
      .get('/bidan/patients?offset=-1')
      .expect(400);
    await request(app.getHttpServer())
      .get('/bidan/patients?unknown=true')
      .expect(400);
  });

  it('routes visit brief and validates profile UUID', async () => {
    await request(app.getHttpServer())
      .get(`/bidan/patients/${profileId}/visit-brief`)
      .expect(200)
      .expect(brief);
    expect(bidanService.getVisitBrief).toHaveBeenCalledWith(
      profileId,
      requester,
      undefined,
    );

    await request(app.getHttpServer())
      .get('/bidan/patients/not-a-uuid/visit-brief')
      .expect(400);
  });

  it('routes regional statistics', async () => {
    await request(app.getHttpServer())
      .get('/bidan/statistics')
      .expect(200)
      .expect(statistics);
    expect(bidanService.getStatistics).toHaveBeenCalledWith(requester);
  });

  it('allows only bidan and admin at controller level', () => {
    expect(Reflect.getMetadata('roles', BidanController)).toEqual([
      'bidan',
      'admin',
    ]);
  });

  it('rejects kader from the clinical patient list', async () => {
    authenticatedUser = {
      ...requester,
      role: UserRole.KADER,
    };

    await request(app.getHttpServer()).get('/bidan/patients').expect(403);
    expect(bidanService.getPatients).not.toHaveBeenCalled();
  });

  it.each([UserRole.IBU_HAMIL, UserRole.KADER])(
    'rejects %s from visit brief',
    async (role) => {
      authenticatedUser = { ...requester, role };

      await request(app.getHttpServer())
        .get(`/bidan/patients/${profileId}/visit-brief`)
        .expect(403);
      expect(bidanService.getVisitBrief).not.toHaveBeenCalled();
    },
  );

  it('allows admin to read visit brief', async () => {
    authenticatedUser = {
      ...requester,
      role: UserRole.ADMIN,
      puskesmas_id: null,
    };

    await request(app.getHttpServer())
      .get(`/bidan/patients/${profileId}/visit-brief`)
      .expect(200)
      .expect(brief);
    expect(bidanService.getVisitBrief).toHaveBeenCalledWith(
      profileId,
      authenticatedUser,
      undefined,
    );
  });

  it('rejects ibu_hamil from statistics', async () => {
    authenticatedUser = {
      ...requester,
      role: UserRole.IBU_HAMIL,
    };

    await request(app.getHttpServer()).get('/bidan/statistics').expect(403);
    expect(bidanService.getStatistics).not.toHaveBeenCalled();
  });

  it('allows admin to read global statistics without query parameters', async () => {
    authenticatedUser = {
      ...requester,
      role: UserRole.ADMIN,
      puskesmas_id: null,
    };

    await request(app.getHttpServer())
      .get('/bidan/statistics')
      .expect(200)
      .expect(statistics);
    expect(bidanService.getStatistics).toHaveBeenCalledWith(authenticatedUser);
  });
});
