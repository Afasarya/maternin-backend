import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { UserRole } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { AiServiceUnavailableException } from '../common/exceptions/ai-service-unavailable.exception.js';
import {
  AiServiceClient,
  type ChatResponse,
} from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CHAT_RETRY_JOB, CHAT_RETRY_QUEUE } from './chat.constants.js';
import type { SendChatDto } from './dto/send-chat.dto.js';

interface Pagination {
  limit: number;
  offset: number;
}

interface PrismaKnownRequestError {
  code: string;
}

export interface ChatRetryJobData {
  user_message_id: string;
  request_id: string;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Partial<PrismaKnownRequestError>).code === 'P2002'
  );
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pregnancyProfilesService: PregnancyProfilesService,
    private readonly aiServiceClient: AiServiceClient,
    @InjectQueue(CHAT_RETRY_QUEUE)
    private readonly chatRetryQueue: Queue<ChatRetryJobData>,
  ) {}

  async sendMessage(
    dto: SendChatDto,
    requester: CurrentUserData,
    requestId: string,
  ) {
    await this.assertOwner(dto.pregnancy_profile_id, requester);

    const userMessage = await this.prisma.chatMessage.create({
      data: {
        pregnancy_profile_id: dto.pregnancy_profile_id,
        sender_type: 'user',
        message: dto.message,
      },
    });

    try {
      return await this.processReply(userMessage.id, requestId);
    } catch (error: unknown) {
      if (!(error instanceof AiServiceUnavailableException)) {
        throw error;
      }

      await this.enqueueReplyRetry(userMessage.id, requestId);
      return {
        status: 'processing' as const,
        message: 'Sedang diproses',
        user_message_id: userMessage.id,
      };
    }
  }

  async sendTrustedWebhookMessage(
    pregnancyProfileId: string,
    message: string,
    requestId: string,
  ) {
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        pregnancy_profile_id: pregnancyProfileId,
        sender_type: 'user',
        message,
      },
    });
    try {
      return await this.processReply(userMessage.id, requestId);
    } catch (error: unknown) {
      if (!(error instanceof AiServiceUnavailableException)) throw error;
      await this.enqueueReplyRetry(userMessage.id, requestId);
      return {
        status: 'processing' as const,
        message: 'Sedang diproses',
        user_message_id: userMessage.id,
      };
    }
  }

  async processReply(
    userMessageId: string,
    requestId: string,
  ): Promise<ChatResponse> {
    const userMessage = await this.prisma.chatMessage.findUnique({
      where: { id: userMessageId },
      include: { reply: true },
    });

    if (!userMessage || userMessage.sender_type !== 'user') {
      throw new NotFoundException('Pesan chat pengguna tidak ditemukan');
    }

    if (userMessage.reply) {
      return this.responseFromReply(userMessage.reply);
    }

    const aiResponse = await this.aiServiceClient.chat(
      {
        pregnancy_profile_id: userMessage.pregnancy_profile_id,
        message: userMessage.message,
      },
      requestId,
    );

    try {
      const reply = await this.prisma.chatMessage.create({
        data: {
          pregnancy_profile_id: userMessage.pregnancy_profile_id,
          sender_type: 'ai',
          message: aiResponse.reply,
          reply_to_message_id: userMessage.id,
          disclaimer_included: aiResponse.disclaimer_included,
        },
      });

      return this.responseFromReply(reply);
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existingReply = await this.prisma.chatMessage.findUnique({
        where: { reply_to_message_id: userMessage.id },
      });

      if (!existingReply) {
        throw error;
      }

      return this.responseFromReply(existingReply);
    }
  }

  async getHistory(
    profileId: string,
    pagination: Pagination,
    requester: CurrentUserData,
  ) {
    await this.pregnancyProfilesService.findOne(profileId, requester);
    const where = { pregnancy_profile_id: profileId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.chatMessage.findMany({
        where,
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        skip: pagination.offset,
        take: pagination.limit,
      }),
      this.prisma.chatMessage.count({ where }),
    ]);

    return { data, total };
  }

  async getMessage(id: string, requester: CurrentUserData) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id },
    });

    if (!message) {
      throw new NotFoundException('Pesan chat tidak ditemukan');
    }

    await this.pregnancyProfilesService.findOne(
      message.pregnancy_profile_id,
      requester,
    );
    return message;
  }

  private async assertOwner(profileId: string, requester: CurrentUserData) {
    const profile = await this.pregnancyProfilesService.findOne(profileId);

    if (
      requester.role !== UserRole.IBU_HAMIL ||
      profile.user_id !== requester.id
    ) {
      throw new ForbiddenException('Tidak memiliki akses ke chat profil ini');
    }
  }

  private responseFromReply(reply: {
    message: string;
    disclaimer_included: boolean | null;
  }): ChatResponse {
    return {
      reply: reply.message,
      disclaimer_included: reply.disclaimer_included === true,
    };
  }

  private async enqueueReplyRetry(userMessageId: string, requestId: string) {
    try {
      await this.chatRetryQueue.add(
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
    } catch (error: unknown) {
      this.logger.error(
        `Gagal memasukkan pesan chat ${userMessageId} ke antrean retry`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
