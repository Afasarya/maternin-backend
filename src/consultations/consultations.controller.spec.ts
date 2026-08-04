import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ConsultationStatus, UserRole } from '../common/constants/index.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ConsultationsController } from './consultations.controller.js';
import { ConsultationsService } from './consultations.service.js';

describe('ConsultationsController', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const consultationId = '22222222-2222-4222-8222-222222222222';
  const requester = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.IBU_HAMIL,
    puskesmas_id: null,
  };
  const consultation = {
    id: consultationId,
    pregnancy_profile_id: profileId,
    status: ConsultationStatus.OPEN,
  };
  const service = {
    create: jest.fn(),
    findByProfile: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConsultationsController],
      providers: [{ provide: ConsultationsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().user = requester;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
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
    service.create.mockResolvedValue(consultation);
    service.findByProfile.mockResolvedValue({
      data: [consultation],
      total: 1,
    });
    service.findOne.mockResolvedValue(consultation);
    service.updateStatus.mockResolvedValue({
      ...consultation,
      status: ConsultationStatus.CLOSED,
    });
  });

  it('creates an open consultation with 201', async () => {
    await request(app.getHttpServer())
      .post('/consultations')
      .send({ pregnancy_profile_id: profileId })
      .expect(201)
      .expect(consultation);

    expect(service.create).toHaveBeenCalledWith(
      { pregnancy_profile_id: profileId },
      requester,
    );
  });

  it('rejects status injection and malformed profile IDs on create', async () => {
    await request(app.getHttpServer())
      .post('/consultations')
      .send({ pregnancy_profile_id: profileId, status: 'closed' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/consultations')
      .send({ pregnancy_profile_id: 'invalid' })
      .expect(400);

    expect(service.create).not.toHaveBeenCalled();
  });

  it('routes filtered and paginated consultation listing', async () => {
    await request(app.getHttpServer())
      .get(
        `/consultations?pregnancy_profile_id=${profileId}&status=open&limit=10&offset=5`,
      )
      .expect(200)
      .expect({ data: [consultation], total: 1 });

    expect(service.findByProfile).toHaveBeenCalledWith(
      profileId,
      {
        pregnancy_profile_id: profileId,
        status: ConsultationStatus.OPEN,
        limit: 10,
        offset: 5,
      },
      requester,
    );
  });

  it('rejects missing profile, invalid status, and invalid pagination', async () => {
    await request(app.getHttpServer()).get('/consultations').expect(400);
    await request(app.getHttpServer())
      .get(`/consultations?pregnancy_profile_id=${profileId}&status=pending`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/consultations?pregnancy_profile_id=${profileId}&limit=101`)
      .expect(400);
  });

  it('routes UUID detail requests and rejects malformed UUIDs', async () => {
    await request(app.getHttpServer())
      .get(`/consultations/${consultationId}`)
      .expect(200)
      .expect(consultation);
    await request(app.getHttpServer())
      .get('/consultations/not-a-uuid')
      .expect(400);

    expect(service.findOne).toHaveBeenCalledWith(consultationId, requester);
  });

  it('routes valid status updates and rejects unknown statuses', async () => {
    await request(app.getHttpServer())
      .patch(`/consultations/${consultationId}/status`)
      .send({ status: ConsultationStatus.CLOSED })
      .expect(200)
      .expect({ ...consultation, status: ConsultationStatus.CLOSED });

    expect(service.updateStatus).toHaveBeenCalledWith(
      consultationId,
      ConsultationStatus.CLOSED,
      requester,
    );

    await request(app.getHttpServer())
      .patch(`/consultations/${consultationId}/status`)
      .send({ status: 'pending' })
      .expect(400);
  });

  it('declares the required role matrices', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ConsultationsController.prototype.create,
      ),
    ).toEqual(['ibu_hamil']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ConsultationsController.prototype.findByProfile,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ConsultationsController.prototype.findOne,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ConsultationsController.prototype.updateStatus,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
  });
});
