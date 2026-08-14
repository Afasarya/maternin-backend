import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  SyncPayloadType,
  SyncStatus,
  UserRole,
} from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

describe('SyncController', () => {
  const deviceUuid = 'device-abc-123';
  const clientUuid = '11111111-1111-4111-8111-111111111111';
  const profileId = '22222222-2222-4222-8222-222222222222';
  let currentUser: CurrentUserData;
  const syncService = {
    processBatch: jest.fn(),
    getDeviceStatus: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        Reflector,
        RolesGuard,
        { provide: SyncService, useValue: syncService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().user = currentUser;
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
    currentUser = {
      id: '33333333-3333-4333-8333-333333333333',
      role: UserRole.KADER,
      puskesmas_id: '44444444-4444-4444-8444-444444444444',
    };
    syncService.processBatch.mockResolvedValue({
      created: true,
      data: {
        total_received: 1,
        processed: 1,
        skipped: 0,
        failed: 0,
        results: [
          {
            client_uuid: clientUuid,
            status: 'processed',
            server_id: '55555555-5555-4555-8555-555555555555',
          },
        ],
      },
    });
  });

  it('returns 201 for a batch containing newly tracked records', async () => {
    const body = {
      device_uuid: deviceUuid,
      records: [
        {
          client_uuid: clientUuid,
          payload_type: SyncPayloadType.ANC_RECORD,
          payload: {
            pregnancy_profile_id: profileId,
            systolic: 120,
            diastolic: 80,
          },
          client_created_at: '2026-07-20T09:00:00.000Z',
        },
      ],
    };

    await request(app.getHttpServer())
      .post('/sync/batch')
      .set('X-Request-Id', 'sync-request-id')
      .send(body)
      .expect(201)
      .expect((response) => {
        const responseBody = response.body as { processed: number };
        expect(responseBody.processed).toBe(1);
      });

    expect(syncService.processBatch).toHaveBeenCalledWith(
      body,
      currentUser,
      'sync-request-id',
    );
  });

  it('returns 200 for a duplicate-only replay', async () => {
    syncService.processBatch.mockResolvedValueOnce({
      created: false,
      data: {
        total_received: 1,
        processed: 0,
        skipped: 1,
        failed: 0,
        results: [
          {
            client_uuid: clientUuid,
            status: 'skipped',
            reason: 'duplicate',
          },
        ],
      },
    });

    await request(app.getHttpServer())
      .post('/sync/batch')
      .send({
        device_uuid: deviceUuid,
        records: [
          {
            client_uuid: clientUuid,
            payload_type: SyncPayloadType.ANC_RECORD,
            payload: { pregnancy_profile_id: profileId },
            client_created_at: '2026-07-20T09:00:00.000Z',
          },
        ],
      })
      .expect(200);
  });

  it('rejects an empty batch because records requires 1-100 items', async () => {
    await request(app.getHttpServer())
      .post('/sync/batch')
      .send({ device_uuid: deviceUuid, records: [] })
      .expect(400);

    expect(syncService.processBatch).not.toHaveBeenCalled();
  });

  it('validates nested records and rejects unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/sync/batch')
      .send({
        device_uuid: deviceUuid,
        records: [
          {
            client_uuid: 'not-a-uuid',
            payload_type: 'unknown',
            payload: {},
            client_created_at: 'not-a-date',
          },
        ],
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/sync/batch')
      .send({ device_uuid: deviceUuid, records: [], unknown: true })
      .expect(400);

    expect(syncService.processBatch).not.toHaveBeenCalled();
  });

  it('routes device status and validates its required query', async () => {
    const status = {
      device_uuid: deviceUuid,
      total: 4,
      processed: 3,
      pending: 0,
      failed: 1,
      last_sync: {
        client_uuid: clientUuid,
        payload_type: SyncPayloadType.ANC_RECORD,
        status: SyncStatus.PROCESSED,
      },
    };
    syncService.getDeviceStatus.mockResolvedValue(status);

    await request(app.getHttpServer())
      .get(`/sync/status?device_uuid=${deviceUuid}`)
      .expect(200)
      .expect(status);
    expect(syncService.getDeviceStatus).toHaveBeenCalledWith(
      deviceUuid,
      currentUser.id,
    );

    await request(app.getHttpServer()).get('/sync/status').expect(400);
  });

  it('allows only kader on both endpoints', async () => {
    currentUser = {
      id: '66666666-6666-4666-8666-666666666666',
      role: UserRole.IBU_HAMIL,
      puskesmas_id: null,
    };

    await request(app.getHttpServer())
      .post('/sync/batch')
      .send({ device_uuid: deviceUuid, records: [] })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/sync/status?device_uuid=${deviceUuid}`)
      .expect(403);

    expect(syncService.processBatch).not.toHaveBeenCalled();
    expect(syncService.getDeviceStatus).not.toHaveBeenCalled();
  });

  it('rejects bidan because PRD reserves batch sync for kader', async () => {
    currentUser = {
      id: '77777777-7777-4777-8777-777777777777',
      role: UserRole.BIDAN,
      puskesmas_id: '44444444-4444-4444-8444-444444444444',
    };

    await request(app.getHttpServer())
      .post('/sync/batch')
      .send({ device_uuid: deviceUuid, records: [] })
      .expect(403);

    expect(syncService.processBatch).not.toHaveBeenCalled();
  });
});
