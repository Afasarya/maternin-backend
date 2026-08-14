import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  BleedingLevel,
  MoodFlag,
  UserRole,
  WoundCondition,
} from '../common/constants/index.js';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PostpartumController } from './postpartum.controller.js';
import { PostpartumService } from './postpartum.service.js';

describe('PostpartumController', () => {
  const internalToken = 'internal-token-minimum-32-characters';
  const profileId = '11111111-1111-4111-8111-111111111111';
  const logId = '22222222-2222-4222-8222-222222222222';
  const requester = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.IBU_HAMIL,
    puskesmas_id: null,
  };
  const createBody = {
    pregnancy_profile_id: profileId,
    day_number: 3,
    bleeding_level: BleedingLevel.NORMAL,
    fever: false,
    wound_condition: WoundCondition.BAIK,
    headache_severe: false,
    mood_flag: MoodFlag.BAIK,
  };
  const callbackBody = {
    pregnancy_profile_id: profileId,
    postpartum_log_id: logId,
    red_flag_triggered: true,
    reason: 'Perdarahan banyak + sakit kepala hebat',
    mental_health_flag: false,
  };
  const log = {
    id: logId,
    ...createBody,
    red_flag_triggered: true,
  };
  const postpartumService = {
    create: jest.fn(),
    updateFlags: jest.fn(),
    findByProfile: jest.fn(),
    findOne: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PostpartumController],
      providers: [
        InternalAuthGuard,
        {
          provide: PostpartumService,
          useValue: postpartumService,
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
    postpartumService.create.mockResolvedValue({
      created: true,
      data: { log },
    });
    postpartumService.updateFlags.mockResolvedValue(log);
    postpartumService.findByProfile.mockResolvedValue({
      data: [log],
      total: 1,
    });
    postpartumService.findOne.mockResolvedValue(log);
  });

  it('creates a postpartum log with 201', async () => {
    await request(app.getHttpServer())
      .post('/postpartum-logs')
      .set('X-Request-Id', 'postpartum-request')
      .send(createBody)
      .expect(201)
      .expect({ log });

    expect(postpartumService.create).toHaveBeenCalledWith(
      createBody,
      requester,
      'postpartum-request',
    );
  });

  it('returns 200 for an idempotent replay', async () => {
    postpartumService.create.mockResolvedValue({
      created: false,
      data: { log },
    });

    await request(app.getHttpServer())
      .post('/postpartum-logs')
      .send(createBody)
      .expect(200);
  });

  it('accepts an internal callback with X-Internal-Token', async () => {
    await request(app.getHttpServer())
      .post('/internal/postpartum-flags')
      .set('X-Internal-Token', internalToken)
      .send(callbackBody)
      .expect(200)
      .expect(log);

    expect(postpartumService.updateFlags).toHaveBeenCalledWith(callbackBody);
  });

  it('rejects an internal callback without X-Internal-Token', async () => {
    await request(app.getHttpServer())
      .post('/internal/postpartum-flags')
      .send(callbackBody)
      .expect(401);

    expect(postpartumService.updateFlags).not.toHaveBeenCalled();
  });

  it('rejects invalid create and callback payloads', async () => {
    await request(app.getHttpServer())
      .post('/postpartum-logs')
      .send({ ...createBody, day_number: 43 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/internal/postpartum-flags')
      .set('X-Internal-Token', internalToken)
      .send({ ...callbackBody, red_flag_triggered: 'yes' })
      .expect(400);
  });

  it('declares create and read role matrices', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        PostpartumController.prototype.create,
      ),
    ).toEqual(['ibu_hamil', 'kader']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        PostpartumController.prototype.findByProfile,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'kader', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        PostpartumController.prototype.findOne,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'kader', 'admin']);
  });

  it('routes paginated and sorted history', async () => {
    await request(app.getHttpServer())
      .get(
        `/postpartum-logs?pregnancy_profile_id=${profileId}&limit=10&offset=5&sort=created_desc`,
      )
      .expect(200)
      .expect({ data: [log], total: 1 });

    expect(postpartumService.findByProfile).toHaveBeenCalledWith(
      profileId,
      {
        pregnancy_profile_id: profileId,
        limit: 10,
        offset: 5,
        sort: 'created_desc',
      },
      requester,
    );
  });

  it('routes UUID detail requests', async () => {
    await request(app.getHttpServer())
      .get(`/postpartum-logs/${logId}`)
      .expect(200)
      .expect(log);

    expect(postpartumService.findOne).toHaveBeenCalledWith(logId, requester);
  });
});
