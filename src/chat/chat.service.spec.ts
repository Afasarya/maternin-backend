import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ChatSenderType, UserRole } from '../common/constants/index.js';
import { AiServiceUnavailableException } from '../common/exceptions/ai-service-unavailable.exception.js';
import { AiServiceClient } from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CHAT_RETRY_JOB } from './chat.constants.js';
import { ChatService, type ChatRetryJobData } from './chat.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));
jest.mock('../common/services/ai-service.client.js', () => ({
  AiServiceClient: class AiServiceClient {},
}));

describe('ChatService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const patientId = '22222222-2222-4222-8222-222222222222';
  const userMessageId = '33333333-3333-4333-8333-333333333333';
  const replyId = '44444444-4444-4444-8444-444444444444';
  const requestId = 'request-chat';
  const owner = {
    id: patientId,
    role: UserRole.IBU_HAMIL,
    puskesmas_id: null,
  };
  const dto = {
    pregnancy_profile_id: profileId,
    message: 'Apakah pusing saat hamil normal?',
  };
  const profile = { id: profileId, user_id: patientId };
  const userMessage = {
    id: userMessageId,
    pregnancy_profile_id: profileId,
    sender_type: ChatSenderType.USER,
    message: dto.message,
    reply_to_message_id: null,
    disclaimer_included: null,
    created_at: new Date('2026-07-29T08:00:00.000Z'),
  };
  const reply = {
    id: replyId,
    pregnancy_profile_id: profileId,
    sender_type: ChatSenderType.AI,
    message: 'Pusing perlu dipantau dan dikonsultasikan bila memburuk.',
    reply_to_message_id: userMessageId,
    disclaimer_included: true,
    created_at: new Date('2026-07-29T08:00:01.000Z'),
  };
  const prisma = {
    chatMessage: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const profiles = { findOne: jest.fn() };
  const ai = { chat: jest.fn() };
  const queue = { add: jest.fn() };
  const service = new ChatService(
    prisma as unknown as PrismaService,
    profiles as unknown as PregnancyProfilesService,
    ai as unknown as AiServiceClient,
    queue as unknown as Queue<ChatRetryJobData>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    profiles.findOne.mockResolvedValue(profile);
    prisma.chatMessage.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(reply);
    prisma.chatMessage.findUnique.mockResolvedValue({
      ...userMessage,
      reply: null,
    });
    ai.chat.mockResolvedValue({
      reply: reply.message,
      disclaimer_included: true,
    });
    queue.add.mockResolvedValue(undefined);
    prisma.chatMessage.findMany.mockResolvedValue([userMessage, reply]);
    prisma.chatMessage.count.mockResolvedValue(2);
    prisma.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );
  });

  it('saves the user message, calls AI, and saves its reply', async () => {
    await expect(service.sendMessage(dto, owner, requestId)).resolves.toEqual({
      reply: reply.message,
      disclaimer_included: true,
    });

    expect(profiles.findOne).toHaveBeenCalledWith(profileId);
    expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(1, {
      data: {
        pregnancy_profile_id: profileId,
        sender_type: ChatSenderType.USER,
        message: dto.message,
      },
    });
    expect(ai.chat).toHaveBeenCalledWith(
      { pregnancy_profile_id: profileId, message: dto.message },
      requestId,
    );
    expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
      data: {
        pregnancy_profile_id: profileId,
        sender_type: ChatSenderType.AI,
        message: reply.message,
        reply_to_message_id: userMessageId,
        disclaimer_included: true,
      },
    });
  });

  it('rejects chat for a profile owned by another patient', async () => {
    await expect(
      service.sendMessage(dto, { ...owner, id: replyId }, requestId),
    ).rejects.toThrow(
      new ForbiddenException('Tidak memiliki akses ke chat profil ini'),
    );

    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('rejects direct service use by non-patient roles', async () => {
    await expect(
      service.sendMessage(
        { ...dto },
        { id: patientId, role: UserRole.ADMIN, puskesmas_id: null },
        requestId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns processing and queues an idempotent retry when AI is down', async () => {
    ai.chat.mockRejectedValue(new AiServiceUnavailableException());

    await expect(service.sendMessage(dto, owner, requestId)).resolves.toEqual({
      status: 'processing',
      message: 'Sedang diproses',
    });

    expect(queue.add).toHaveBeenCalledWith(
      CHAT_RETRY_JOB,
      { user_message_id: userMessageId, request_id: requestId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        jobId: userMessageId,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(1);
  });

  it('does not call AI again when a reply already exists', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({
      ...userMessage,
      reply,
    });

    await expect(
      service.processReply(userMessageId, requestId),
    ).resolves.toEqual({
      reply: reply.message,
      disclaimer_included: true,
    });

    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('throws when the retry target is not a user message', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({ ...reply, reply: null });

    await expect(
      service.processReply(userMessageId, requestId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the winning reply when concurrent workers race', async () => {
    prisma.chatMessage.create.mockReset().mockRejectedValue({ code: 'P2002' });
    prisma.chatMessage.findUnique
      .mockResolvedValueOnce({ ...userMessage, reply: null })
      .mockResolvedValueOnce(reply);

    await expect(
      service.processReply(userMessageId, requestId),
    ).resolves.toEqual({
      reply: reply.message,
      disclaimer_included: true,
    });
  });

  it('lists chronological history with pagination after access validation', async () => {
    await expect(
      service.getHistory(profileId, { limit: 10, offset: 5 }, owner),
    ).resolves.toEqual({ data: [userMessage, reply], total: 2 });

    expect(profiles.findOne).toHaveBeenCalledWith(profileId, owner);
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { pregnancy_profile_id: profileId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      skip: 5,
      take: 10,
    });
  });

  it('returns a message only after profile access validation', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue(userMessage);

    await expect(service.getMessage(userMessageId, owner)).resolves.toEqual(
      userMessage,
    );
    expect(profiles.findOne).toHaveBeenCalledWith(profileId, owner);
  });

  it('throws when a chat message does not exist', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue(null);

    await expect(service.getMessage(userMessageId, owner)).rejects.toThrow(
      new NotFoundException('Pesan chat tidak ditemukan'),
    );
  });
});
