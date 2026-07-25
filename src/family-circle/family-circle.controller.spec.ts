import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { NotifyOn, UserRole } from '../common/constants/index.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { FamilyCircleController } from './family-circle.controller.js';
import { FamilyCircleService } from './family-circle.service.js';

describe('FamilyCircleController', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const contactId = '22222222-2222-4222-8222-222222222222';
  const requester = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.IBU_HAMIL,
    puskesmas_id: null,
  };
  const createBody = {
    pregnancy_profile_id: profileId,
    contact_name: 'Budi Santoso',
    contact_phone: '+628123456789',
    relation: 'suami',
    notify_on: NotifyOn.SEMUA_PERUBAHAN,
  };
  const contact = {
    id: contactId,
    ...createBody,
    created_at: '2026-07-25T10:00:00.000Z',
  };
  const familyCircleService = {
    create: jest.fn(),
    findByProfile: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FamilyCircleController],
      providers: [
        {
          provide: FamilyCircleService,
          useValue: familyCircleService,
        },
      ],
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
    familyCircleService.create.mockResolvedValue(contact);
    familyCircleService.findByProfile.mockResolvedValue({
      data: [contact],
      total: 1,
    });
    familyCircleService.findOne.mockResolvedValue(contact);
    familyCircleService.update.mockResolvedValue(contact);
    familyCircleService.remove.mockResolvedValue(contact);
  });

  it('creates a family contact with 201', async () => {
    await request(app.getHttpServer())
      .post('/family-circle')
      .send(createBody)
      .expect(201)
      .expect(contact);

    expect(familyCircleService.create).toHaveBeenCalledWith(
      createBody,
      requester,
    );
  });

  it('rejects invalid create payloads', async () => {
    await request(app.getHttpServer())
      .post('/family-circle')
      .send({ ...createBody, notify_on: 'tidak_valid' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/family-circle')
      .send({ ...createBody, contact_name: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/family-circle')
      .send({ ...createBody, unknown_field: true })
      .expect(400);

    expect(familyCircleService.create).not.toHaveBeenCalled();
  });

  it('routes paginated contact listing', async () => {
    await request(app.getHttpServer())
      .get(`/family-circle?pregnancy_profile_id=${profileId}&limit=10&offset=5`)
      .expect(200)
      .expect({ data: [contact], total: 1 });

    expect(familyCircleService.findByProfile).toHaveBeenCalledWith(
      profileId,
      {
        pregnancy_profile_id: profileId,
        limit: 10,
        offset: 5,
      },
      requester,
    );
  });

  it('rejects missing profile query and invalid pagination', async () => {
    await request(app.getHttpServer()).get('/family-circle').expect(400);
    await request(app.getHttpServer())
      .get(`/family-circle?pregnancy_profile_id=${profileId}&limit=101`)
      .expect(400);
  });

  it('routes UUID detail requests', async () => {
    await request(app.getHttpServer())
      .get(`/family-circle/${contactId}`)
      .expect(200)
      .expect(contact);

    expect(familyCircleService.findOne).toHaveBeenCalledWith(
      contactId,
      requester,
    );
  });

  it('rejects an invalid UUID path', async () => {
    await request(app.getHttpServer())
      .get('/family-circle/not-a-uuid')
      .expect(400);
    expect(familyCircleService.findOne).not.toHaveBeenCalled();
  });

  it('routes a partial update without pregnancy_profile_id', async () => {
    const dto = { contact_phone: '+628987654321' };

    await request(app.getHttpServer())
      .patch(`/family-circle/${contactId}`)
      .send(dto)
      .expect(200)
      .expect(contact);

    expect(familyCircleService.update).toHaveBeenCalledWith(
      contactId,
      dto,
      requester,
    );
  });

  it('rejects pregnancy_profile_id changes', async () => {
    await request(app.getHttpServer())
      .patch(`/family-circle/${contactId}`)
      .send({ pregnancy_profile_id: profileId })
      .expect(400);
    expect(familyCircleService.update).not.toHaveBeenCalled();
  });

  it('routes hard delete requests', async () => {
    await request(app.getHttpServer())
      .delete(`/family-circle/${contactId}`)
      .expect(200)
      .expect(contact);

    expect(familyCircleService.remove).toHaveBeenCalledWith(
      contactId,
      requester,
    );
  });

  it('declares the required role matrices', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        FamilyCircleController.prototype.create,
      ),
    ).toEqual(['ibu_hamil']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        FamilyCircleController.prototype.findByProfile,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        FamilyCircleController.prototype.findOne,
      ),
    ).toEqual(['ibu_hamil', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        FamilyCircleController.prototype.update,
      ),
    ).toEqual(['ibu_hamil']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        FamilyCircleController.prototype.remove,
      ),
    ).toEqual(['ibu_hamil']);
  });
});
