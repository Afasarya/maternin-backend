import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RiskBadge, UserRole } from '../common/constants/index.js';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { RiskAssessmentsController } from './risk-assessments.controller.js';
import { RiskAssessmentsService } from './risk-assessments.service.js';

describe('RiskAssessmentsController internal callback', () => {
  const internalToken = 'internal-token-minimum-32-characters';
  const callbackBody = {
    pregnancy_profile_id: '11111111-1111-4111-8111-111111111111',
    symptom_checkin_id: null,
    triage_score: 75,
    anemia_probability: 0.3,
    preeclampsia_probability: 0.8,
    aggregate_score: 84,
    risk_badge: RiskBadge.MERAH,
    risk_factors: ['Tekanan darah tinggi'],
    recommendation_text: 'Segera ke fasilitas kesehatan',
    alert_delivery_status: 'sent',
    anemia_is_mock: false,
    bidan_review_required: true,
    disclaimer: 'Hasil ini adalah skrining otomatis, bukan diagnosis.',
    screening_not_diagnosis: true,
  };
  const assessment = {
    id: '22222222-2222-4222-8222-222222222222',
    ...callbackBody,
  };
  let app: INestApplication<App>;
  const riskAssessmentsService = {
    createFromCallback: jest.fn(),
    findByProfile: jest.fn(),
    findLatest: jest.fn(),
    findOne: jest.fn(),
  };

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [RiskAssessmentsController],
      providers: [
        InternalAuthGuard,
        {
          provide: RiskAssessmentsService,
          useValue: riskAssessmentsService,
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(internalToken),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().user = {
            id: '33333333-3333-4333-8333-333333333333',
            role: UserRole.IBU_HAMIL,
            puskesmas_id: null,
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true });
    const moduleRef = await moduleBuilder.compile();

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
    riskAssessmentsService.createFromCallback.mockResolvedValue({
      assessment,
      created: true,
    });
  });

  it('persists a valid callback with X-Internal-Token', async () => {
    await request(app.getHttpServer())
      .post('/internal/risk-assessments')
      .set('X-Internal-Token', internalToken)
      .send(callbackBody)
      .expect(201)
      .expect(assessment);

    expect(riskAssessmentsService.createFromCallback).toHaveBeenCalledWith(
      callbackBody,
    );
  });

  it('rejects a callback without X-Internal-Token', async () => {
    await request(app.getHttpServer())
      .post('/internal/risk-assessments')
      .send(callbackBody)
      .expect(401);

    expect(riskAssessmentsService.createFromCallback).not.toHaveBeenCalled();
  });

  it('returns 200 for an idempotent callback replay', async () => {
    riskAssessmentsService.createFromCallback.mockResolvedValue({
      assessment,
      created: false,
    });

    await request(app.getHttpServer())
      .post('/internal/risk-assessments')
      .set('X-Internal-Token', internalToken)
      .send(callbackBody)
      .expect(200)
      .expect(assessment);
  });

  it('rejects an invalid callback payload', async () => {
    await request(app.getHttpServer())
      .post('/internal/risk-assessments')
      .set('X-Internal-Token', internalToken)
      .send({ ...callbackBody, risk_badge: 'ungu' })
      .expect(400);

    expect(riskAssessmentsService.createFromCallback).not.toHaveBeenCalled();
  });

  it('declares the required role matrix on public endpoints', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        RiskAssessmentsController.prototype.findByProfile,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        RiskAssessmentsController.prototype.findLatest,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        RiskAssessmentsController.prototype.findOne,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
  });

  it('routes history with transformed pagination defaults', async () => {
    riskAssessmentsService.findByProfile.mockResolvedValue({
      data: [assessment],
      total: 1,
    });

    await request(app.getHttpServer())
      .get(
        `/pregnancy-profiles/${callbackBody.pregnancy_profile_id}/risk-assessments`,
      )
      .expect(200)
      .expect({ data: [assessment], total: 1 });

    expect(riskAssessmentsService.findByProfile).toHaveBeenCalledWith(
      callbackBody.pregnancy_profile_id,
      { limit: 20, offset: 0 },
      {
        id: '33333333-3333-4333-8333-333333333333',
        role: UserRole.IBU_HAMIL,
        puskesmas_id: null,
      },
    );
  });

  it('routes latest before the UUID detail parameter', async () => {
    riskAssessmentsService.findLatest.mockResolvedValue(assessment);

    await request(app.getHttpServer())
      .get(
        `/risk-assessments/latest?pregnancy_profile_id=${callbackBody.pregnancy_profile_id}`,
      )
      .expect(200)
      .expect(assessment);

    expect(riskAssessmentsService.findLatest).toHaveBeenCalledWith(
      callbackBody.pregnancy_profile_id,
      expect.objectContaining({ role: UserRole.IBU_HAMIL }),
    );
    expect(riskAssessmentsService.findOne).not.toHaveBeenCalled();
  });

  it('routes UUID detail requests', async () => {
    riskAssessmentsService.findOne.mockResolvedValue(assessment);

    await request(app.getHttpServer())
      .get(`/risk-assessments/${assessment.id}`)
      .expect(200)
      .expect(assessment);

    expect(riskAssessmentsService.findOne).toHaveBeenCalledWith(
      assessment.id,
      expect.objectContaining({ role: UserRole.IBU_HAMIL }),
    );
  });
});
