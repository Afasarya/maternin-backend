import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  ReminderStatus,
  ReminderType,
  UserRole,
} from '../common/constants/index.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';

describe('RemindersController', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const reminderId = '22222222-2222-4222-8222-222222222222';
  const requester = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.BIDAN,
    puskesmas_id: '44444444-4444-4444-8444-444444444444',
  };
  const reminder = {
    id: reminderId,
    pregnancy_profile_id: profileId,
    reminder_type: ReminderType.ANC_CHECKUP,
    cadence_days: 14,
    next_trigger_at: '2026-08-08T10:00:00.000Z',
    last_sent_at: null,
    status: ReminderStatus.ACTIVE,
  };
  const remindersService = {
    findByProfile: jest.fn(),
    findOne: jest.fn(),
    pauseReminder: jest.fn(),
    resumeReminder: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RemindersController],
      providers: [{ provide: RemindersService, useValue: remindersService }],
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
    remindersService.findByProfile.mockResolvedValue({
      data: [reminder],
      total: 1,
    });
    remindersService.findOne.mockResolvedValue(reminder);
    remindersService.pauseReminder.mockResolvedValue({
      ...reminder,
      status: ReminderStatus.PAUSED,
    });
    remindersService.resumeReminder.mockResolvedValue(reminder);
  });

  it('routes paginated reminder listing with filters', async () => {
    await request(app.getHttpServer())
      .get(
        `/reminders?pregnancy_profile_id=${profileId}&reminder_type=anc_checkup&status=active&limit=10&offset=5`,
      )
      .expect(200)
      .expect({ data: [reminder], total: 1 });

    expect(remindersService.findByProfile).toHaveBeenCalledWith(
      profileId,
      {
        pregnancy_profile_id: profileId,
        reminder_type: ReminderType.ANC_CHECKUP,
        status: ReminderStatus.ACTIVE,
        limit: 10,
        offset: 5,
      },
      requester,
    );
  });

  it('rejects missing profile, invalid enum, pagination, and unknown fields', async () => {
    await request(app.getHttpServer()).get('/reminders').expect(400);
    await request(app.getHttpServer())
      .get(`/reminders?pregnancy_profile_id=${profileId}&status=invalid`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/reminders?pregnancy_profile_id=${profileId}&limit=101`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/reminders?pregnancy_profile_id=${profileId}&unknown=true`)
      .expect(400);
  });

  it('routes UUID detail requests', async () => {
    await request(app.getHttpServer())
      .get(`/reminders/${reminderId}`)
      .expect(200)
      .expect(reminder);
    expect(remindersService.findOne).toHaveBeenCalledWith(
      reminderId,
      requester,
    );
  });

  it('rejects invalid UUID paths', async () => {
    await request(app.getHttpServer()).get('/reminders/not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .patch('/reminders/not-a-uuid/pause')
      .expect(400);
  });

  it('routes pause and resume actions', async () => {
    await request(app.getHttpServer())
      .patch(`/reminders/${reminderId}/pause`)
      .expect(200)
      .expect({ ...reminder, status: ReminderStatus.PAUSED });
    await request(app.getHttpServer())
      .patch(`/reminders/${reminderId}/resume`)
      .expect(200)
      .expect(reminder);

    expect(remindersService.pauseReminder).toHaveBeenCalledWith(
      reminderId,
      requester,
    );
    expect(remindersService.resumeReminder).toHaveBeenCalledWith(
      reminderId,
      requester,
    );
  });

  it('declares required role matrices', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        RemindersController.prototype.findByProfile,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        RemindersController.prototype.findOne,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        RemindersController.prototype.pause,
      ),
    ).toEqual(['bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        RemindersController.prototype.resume,
      ),
    ).toEqual(['bidan', 'admin']);
  });

  it('excludes kader from reminder read roles', () => {
    const listRoles = Reflect.getMetadata(
      'roles',
      // eslint-disable-next-line @typescript-eslint/unbound-method
      RemindersController.prototype.findByProfile,
    ) as string[];
    const detailRoles = Reflect.getMetadata(
      'roles',
      // eslint-disable-next-line @typescript-eslint/unbound-method
      RemindersController.prototype.findOne,
    ) as string[];

    expect(listRoles).not.toContain('kader');
    expect(detailRoles).not.toContain('kader');
  });
});
