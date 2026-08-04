import type { Job } from 'bullmq';
import { CHAT_RETRY_JOB } from './chat.constants.js';
import { ChatRetryProcessor } from './chat-retry.processor.js';
import { ChatService, type ChatRetryJobData } from './chat.service.js';

describe('ChatRetryProcessor', () => {
  const chatService = { processReply: jest.fn() };
  const processor = new ChatRetryProcessor(
    chatService as unknown as ChatService,
  );
  const job = {
    name: CHAT_RETRY_JOB,
    data: {
      user_message_id: '11111111-1111-4111-8111-111111111111',
      request_id: 'request-chat',
    },
  } as Job<ChatRetryJobData>;

  beforeEach(() => jest.clearAllMocks());

  it('delegates retry jobs while preserving request tracing', async () => {
    chatService.processReply.mockResolvedValue({
      reply: 'Jawaban',
      disclaimer_included: true,
    });

    await expect(processor.process(job)).resolves.toEqual({
      reply: 'Jawaban',
      disclaimer_included: true,
    });
    expect(chatService.processReply).toHaveBeenCalledWith(
      job.data.user_message_id,
      job.data.request_id,
    );
  });

  it('rejects unknown job names', async () => {
    await expect(
      processor.process({ ...job, name: 'unknown' } as Job<ChatRetryJobData>),
    ).rejects.toThrow('Job chat tidak dikenal: unknown');
  });
});
