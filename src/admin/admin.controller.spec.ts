import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserRole } from '../common/constants/index.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

describe('AdminController', () => {
  const adminService = { getStatistics: jest.fn() };
  let role = UserRole.ADMIN;
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        RolesGuard,
        { provide: AdminService, useValue: adminService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().user = {
            id: '11111111-1111-4111-8111-111111111111',
            role,
            puskesmas_id: null,
          };
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
    role = UserRole.ADMIN;
    adminService.getStatistics.mockResolvedValue({ total_puskesmas: 2 });
  });

  it('routes validated date filters for admin', async () => {
    await request(app.getHttpServer())
      .get(
        '/admin/statistics?date_from=2026-08-01T00:00:00.000Z&date_to=2026-08-31T23:59:59.999Z',
      )
      .expect(200);
    expect(adminService.getStatistics).toHaveBeenCalledWith({
      date_from: '2026-08-01T00:00:00.000Z',
      date_to: '2026-08-31T23:59:59.999Z',
    });
  });

  it('rejects invalid or unknown query fields', async () => {
    await request(app.getHttpServer())
      .get('/admin/statistics?date_from=invalid')
      .expect(400);
    await request(app.getHttpServer())
      .get('/admin/statistics?unknown=true')
      .expect(400);
    expect(adminService.getStatistics).not.toHaveBeenCalled();
  });

  it('rejects non-admin roles', async () => {
    role = UserRole.BIDAN;
    await request(app.getHttpServer()).get('/admin/statistics').expect(403);
    expect(adminService.getStatistics).not.toHaveBeenCalled();
  });
});