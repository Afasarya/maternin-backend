import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserRole } from '../common/constants/index.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

describe('ChatController', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const messageId = '22222222-2222-4222-8222-222222222222';
  const requester = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.IBU_HAMIL,
    puskesmas_id: null,
  };
  const chatService = {
    sendMessage: jest.fn(),
    getHistory: jest.fn(),
    getMessage: jest.fn(),
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatService }],
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
      .overrideGuard(ThrottlerGuard)
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

  afterAll(() => app?.close());

  beforeEach(() => {
    jest.clearAllMocks();
    chatService.sendMessage.mockResolvedValue({
      reply: 'Jawaban AI',
      disclaimer_included: true,
    });
    chatService.getHistory.mockResolvedValue({ data: [], total: 0 });
    chatService.getMessage.mockResolvedValue({ id: messageId });
  });

  it('routes trimmed chat messages with 201 and request tracing', async () => {
    await request(app.getHttpServer())
      .post('/chat')
      .set('X-Request-Id', 'request-chat')
      .send({ pregnancy_profile_id: profileId, message: '  Pertanyaan  ' })
      .expect(201)
      .expect({ reply: 'Jawaban AI', disclaimer_included: true });

    expect(chatService.sendMessage).toHaveBeenCalledWith(
      { pregnancy_profile_id: profileId, message: 'Pertanyaan' },
      requester,
      'request-chat',
    );
  });

  it('rejects blank messages and unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/chat')
      .send({ pregnancy_profile_id: profileId, message: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/chat')
      .send({
        pregnancy_profile_id: profileId,
        message: 'Pertanyaan',
        unknown_field: true,
      })
      .expect(400);

    expect(chatService.sendMessage).not.toHaveBeenCalled();
  });

  it('routes paginated chat history', async () => {
    await request(app.getHttpServer())
      .get(`/chat/history?pregnancy_profile_id=${profileId}&limit=10&offset=5`)
      .expect(200)
      .expect({ data: [], total: 0 });

    expect(chatService.getHistory).toHaveBeenCalledWith(
      profileId,
      { pregnancy_profile_id: profileId, limit: 10, offset: 5 },
      requester,
    );
  });

  it('rejects missing profile query and invalid pagination', async () => {
    await request(app.getHttpServer()).get('/chat/history').expect(400);
    await request(app.getHttpServer())
      .get(`/chat/history?pregnancy_profile_id=${profileId}&limit=101`)
      .expect(400);
  });

  it('routes UUID message details and rejects malformed UUIDs', async () => {
    await request(app.getHttpServer())
      .get(`/chat/history/${messageId}`)
      .expect(200)
      .expect({ id: messageId });
    await request(app.getHttpServer())
      .get('/chat/history/not-a-uuid')
      .expect(400);

    expect(chatService.getMessage).toHaveBeenCalledWith(messageId, requester);
  });

  it('declares the required role matrices', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ChatController.prototype.sendMessage,
      ),
    ).toEqual(['ibu_hamil']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ChatController.prototype.getHistory,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
    expect(
      Reflect.getMetadata(
        'roles',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ChatController.prototype.getMessage,
      ),
    ).toEqual(['ibu_hamil', 'bidan', 'admin']);
  });
});
