import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  NotificationChannel,
  NotificationStatus,
  UserRole,
} from '../common/constants/index.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsController', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const notificationId = '22222222-2222-4222-8222-222222222222';
  const requester = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.BIDAN,
    puskesmas_id: '44444444-4444-4444-8444-444444444444',
  };
  const notification = {
    id: notificationId,
    pregnancy_profile_id: profileId,
    channel: NotificationChannel.WA_PATIENT,
    message: 'Pesan',
    status: NotificationStatus.SENT,
    sent_at: '2026-07-27T08:00:00.000Z',
    created_at: '2026-07-27T08:00:00.000Z',
  };
  const notificationsService = {
    getNotificationHistory: jest.fn(),
    findOne: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: notificationsService },
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
    notificationsService.getNotificationHistory.mockResolvedValue({
      data: [notification],
      total: 1,
    });
    notificationsService.findOne.mockResolvedValue(notification);
  });

  it('routes paginated history with channel and status filters', async () => {
    await request(app.getHttpServer())
      .get(
        `/notifications?pregnancy_profile_id=${profileId}&channel=wa_patient&status=sent&limit=10&offset=5`,
      )
      .expect(200)
      .expect({ data: [notification], total: 1 });

    expect(notificationsService.getNotificationHistory).toHaveBeenCalledWith(
      profileId,
      {
        pregnancy_profile_id: profileId,
        channel: NotificationChannel.WA_PATIENT,
        status: NotificationStatus.SENT,
        limit: 10,
        offset: 5,
      },
      requester,
    );
  });

  it('rejects missing profile, invalid filters, pagination, and unknown fields', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(400);
    await request(app.getHttpServer())
      .get(`/notifications?pregnancy_profile_id=${profileId}&channel=invalid`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/notifications?pregnancy_profile_id=${profileId}&status=invalid`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/notifications?pregnancy_profile_id=${profileId}&limit=101`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/notifications?pregnancy_profile_id=${profileId}&unknown=true`)
      .expect(400);
  });

  it('routes UUID detail and rejects invalid UUID paths', async () => {
    await request(app.getHttpServer())
      .get(`/notifications/${notificationId}`)
      .expect(200)
      .expect(notification);
    expect(notificationsService.findOne).toHaveBeenCalledWith(
      notificationId,
      requester,
    );

    await request(app.getHttpServer())
      .get('/notifications/not-a-uuid')
      .expect(400);
  });

  it('allows owner, bidan, admin reads and excludes kader', () => {
    const listRoles = Reflect.getMetadata(
      'roles',
      // eslint-disable-next-line @typescript-eslint/unbound-method
      NotificationsController.prototype.findByProfile,
    ) as string[];
    const detailRoles = Reflect.getMetadata(
      'roles',
      // eslint-disable-next-line @typescript-eslint/unbound-method
      NotificationsController.prototype.findOne,
    ) as string[];

    expect(listRoles).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(detailRoles).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(listRoles).not.toContain('kader');
    expect(detailRoles).not.toContain('kader');
  });
});
