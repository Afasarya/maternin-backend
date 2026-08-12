import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  BleedingLevel,
  MoodFlag,
  UserRole,
  WoundCondition,
} from '../common/constants/index.js';
import { AiServiceUnavailableException } from '../common/exceptions/ai-service-unavailable.exception.js';
import { AiServiceClient } from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostpartumLogSort } from './dto/query-postpartum-logs.dto.js';
import { POSTPARTUM_RETRY_JOB } from './postpartum.constants.js';
import {
  PostpartumService,
  type PostpartumRetryJobData,
} from './postpartum.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));

jest.mock('../reminders/reminders.service.js', () => ({
  RemindersService: class RemindersService {},
}));

describe('PostpartumService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const otherProfileId = '22222222-2222-4222-8222-222222222222';
  const patientId = '33333333-3333-4333-8333-333333333333';
  const otherPatientId = '44444444-4444-4444-8444-444444444444';
  const staffId = '55555555-5555-4555-8555-555555555555';
  const puskesmasId = '66666666-6666-4666-8666-666666666666';
  const otherPuskesmasId = '77777777-7777-4777-8777-777777777777';
  const logId = '88888888-8888-4888-8888-888888888888';
  const clientUuid = '99999999-9999-4999-8999-999999999999';
  const requestId = 'request-postpartum-123';
  const profile = {
    id: profileId,
    user_id: patientId,
    status: 'nifas',
    had_preeclampsia_history: true,
    user: { puskesmas_id: puskesmasId },
  };
  const dto = {
    pregnancy_profile_id: profileId,
    day_number: 3,
    bleeding_level: BleedingLevel.NORMAL,
    fever: false,
    wound_condition: WoundCondition.BAIK,
    headache_severe: false,
    mood_flag: MoodFlag.BAIK,
    client_uuid: clientUuid,
  };
  const log = {
    id: logId,
    ...dto,
    red_flag_triggered: false,
    evaluation_reason: null,
    mental_health_flag: null,
    evaluated_at: null,
    created_at: new Date('2026-07-25T10:00:00.000Z'),
  };
  const evaluation = {
    red_flag_triggered: true,
    reason: 'Perdarahan banyak + sakit kepala hebat',
    mental_health_flag: false,
  };
  const evaluatedLog = {
    ...log,
    red_flag_triggered: true,
    evaluation_reason: evaluation.reason,
    mental_health_flag: false,
    evaluated_at: new Date('2026-07-25T10:00:01.000Z'),
  };
  const owner = {
    id: patientId,
    role: UserRole.IBU_HAMIL,
    puskesmas_id: puskesmasId,
  };
  const prisma = {
    postpartumLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    user: { findFirst: jest.fn() },
  };
  const aiServiceClient = {
    evaluatePostpartum: jest.fn(),
  };
  const pregnancyProfilesService = {
    findOne: jest.fn(),
  };
  const remindersService = {
    createPostpartumReminder: jest.fn(),
  };
  const postpartumRetryQueue = {
    add: jest.fn(),
  };
  const notificationsService = { sendNotification: jest.fn() };
  const service = new PostpartumService(
    prisma as unknown as PrismaService,
    aiServiceClient as unknown as AiServiceClient,
    pregnancyProfilesService as unknown as PregnancyProfilesService,
    remindersService as unknown as RemindersService,
    notificationsService as unknown as NotificationsService,
    postpartumRetryQueue as unknown as Queue<PostpartumRetryJobData>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    pregnancyProfilesService.findOne.mockResolvedValue(profile);
    prisma.postpartumLog.findFirst.mockResolvedValue(null);
    prisma.postpartumLog.create.mockResolvedValue(log);
    prisma.postpartumLog.findMany.mockResolvedValue([
      {
        day_number: 3,
        bleeding_level: BleedingLevel.NORMAL,
        fever: false,
        wound_condition: WoundCondition.BAIK,
        headache_severe: false,
        mood_flag: MoodFlag.BAIK,
      },
    ]);
    prisma.user.findFirst.mockResolvedValue(null);
    remindersService.createPostpartumReminder.mockResolvedValue({
      id: 'reminder-id',
    });
    prisma.$transaction.mockImplementation(
      async (
        input:
          | Array<Promise<unknown>>
          | ((transaction: typeof prisma) => Promise<unknown>),
      ) => (typeof input === 'function' ? input(prisma) : Promise.all(input)),
    );
  });

  it('creates a log, evaluates it, persists flags, and sets day 1-3 cadence', async () => {
    prisma.postpartumLog.findUnique
      .mockResolvedValueOnce(log)
      .mockResolvedValueOnce(evaluatedLog);
    prisma.postpartumLog.update.mockResolvedValue(evaluatedLog);
    aiServiceClient.evaluatePostpartum.mockResolvedValue(evaluation);

    await expect(service.create(dto, owner, requestId)).resolves.toEqual({
      created: true,
      data: { log: evaluatedLog, evaluation },
    });

    expect(aiServiceClient.evaluatePostpartum).toHaveBeenCalledWith(
      {
        pregnancy_profile_id: profileId,
        logs: [
          {
            day_number: 3,
            bleeding_level: BleedingLevel.NORMAL,
            fever: false,
            wound_condition: WoundCondition.BAIK,
            headache_severe: false,
            mood_flag: MoodFlag.BAIK,
          },
        ],
        had_preeclampsia_history: true,
      },
      requestId,
    );
    expect(prisma.postpartumLog.update).toHaveBeenCalledWith({
      where: { id: logId },
      data: {
        red_flag_triggered: true,
        evaluation_reason: evaluation.reason,
        mental_health_flag: false,
        evaluated_at: expect.any(Date) as Date,
      },
    });
    expect(remindersService.createPostpartumReminder).toHaveBeenCalledWith(
      profileId,
      3,
      prisma,
    );
  });

  it.each([1, 3, 4, 14, 15, 42])(
    'delegates day %i postpartum cadence to reminders',
    async (day) => {
      const currentLog = { ...log, day_number: day };
      prisma.postpartumLog.create.mockResolvedValue(currentLog);
      prisma.postpartumLog.findUnique.mockResolvedValue(currentLog);
      aiServiceClient.evaluatePostpartum.mockRejectedValue(
        new AiServiceUnavailableException(),
      );
      postpartumRetryQueue.add.mockResolvedValue({ id: logId });

      await service.create({ ...dto, day_number: day }, owner, requestId);

      expect(remindersService.createPostpartumReminder).toHaveBeenCalledWith(
        profileId,
        day,
        prisma,
      );
    },
  );

  it('returns processing and queues retry when AI is unavailable', async () => {
    prisma.postpartumLog.findUnique.mockResolvedValue(log);
    aiServiceClient.evaluatePostpartum.mockRejectedValue(
      new AiServiceUnavailableException(),
    );
    postpartumRetryQueue.add.mockResolvedValue({ id: logId });

    await expect(service.create(dto, owner, requestId)).resolves.toEqual({
      created: true,
      data: {
        log,
        status: 'processing',
        message: 'Sedang diproses',
      },
    });

    expect(postpartumRetryQueue.add).toHaveBeenCalledWith(
      POSTPARTUM_RETRY_JOB,
      { postpartum_log_id: logId, request_id: requestId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        jobId: logId,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  });

  it('returns an evaluated idempotent replay without calling AI', async () => {
    prisma.postpartumLog.findFirst.mockResolvedValue(evaluatedLog);

    await expect(service.create(dto, owner, requestId)).resolves.toEqual({
      created: false,
      data: { log: evaluatedLog, evaluation },
    });

    expect(prisma.postpartumLog.create).not.toHaveBeenCalled();
    expect(aiServiceClient.evaluatePostpartum).not.toHaveBeenCalled();
  });

  it('rejects a profile outside nifas status', async () => {
    pregnancyProfilesService.findOne.mockResolvedValue({
      ...profile,
      status: 'hamil',
    });

    await expect(service.create(dto, owner, requestId)).rejects.toThrow(
      new BadRequestException('Profil harus berstatus nifas'),
    );
    expect(prisma.postpartumLog.create).not.toHaveBeenCalled();
  });

  it('allows only the owner patient to create', async () => {
    await expect(
      service.create(dto, { ...owner, id: otherPatientId }, requestId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a kader only inside the profile puskesmas', async () => {
    prisma.postpartumLog.findUnique.mockResolvedValue(log);
    aiServiceClient.evaluatePostpartum.mockRejectedValue(
      new AiServiceUnavailableException(),
    );

    await expect(
      service.create(
        dto,
        { id: staffId, role: UserRole.KADER, puskesmas_id: puskesmasId },
        requestId,
      ),
    ).resolves.toMatchObject({ created: true });

    await expect(
      service.create(
        dto,
        {
          id: staffId,
          role: UserRole.KADER,
          puskesmas_id: otherPuskesmasId,
        },
        requestId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates flags from a matching internal callback', async () => {
    prisma.postpartumLog.findUnique.mockResolvedValue(log);
    prisma.postpartumLog.update.mockResolvedValue(evaluatedLog);

    await expect(
      service.updateFlags({
        pregnancy_profile_id: profileId,
        postpartum_log_id: logId,
        ...evaluation,
      }),
    ).resolves.toEqual(evaluatedLog);

    expect(prisma.postpartumLog.update).toHaveBeenCalledWith({
      where: { id: logId },
      data: {
        red_flag_triggered: true,
        evaluation_reason: evaluation.reason,
        mental_health_flag: false,
        evaluated_at: expect.any(Date) as Date,
      },
    });
  });

  it('rejects a callback whose profile does not own the log', async () => {
    prisma.postpartumLog.findUnique.mockResolvedValue(log);

    await expect(
      service.updateFlags({
        pregnancy_profile_id: otherProfileId,
        postpartum_log_id: logId,
        ...evaluation,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists logs with pagination and requested sorting for authorized roles', async () => {
    prisma.postpartumLog.findMany.mockResolvedValue([evaluatedLog]);
    prisma.postpartumLog.count.mockResolvedValue(1);
    const bidan = {
      id: staffId,
      role: UserRole.BIDAN,
      puskesmas_id: puskesmasId,
    };

    await expect(
      service.findByProfile(
        profileId,
        { limit: 10, offset: 5, sort: PostpartumLogSort.CREATED_DESC },
        bidan,
      ),
    ).resolves.toEqual({ data: [evaluatedLog], total: 1 });

    expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
      profileId,
      bidan,
    );
    expect(prisma.postpartumLog.findMany).toHaveBeenCalledWith({
      where: { pregnancy_profile_id: profileId },
      orderBy: [{ created_at: 'desc' }],
      skip: 5,
      take: 10,
    });
  });

  it.each([UserRole.IBU_HAMIL, UserRole.BIDAN])(
    'propagates access denial for unauthorized %s reads',
    async (role) => {
      const requester = {
        id: otherPatientId,
        role,
        puskesmas_id: otherPuskesmasId,
      };
      pregnancyProfilesService.findOne.mockRejectedValue(
        new ForbiddenException('Tidak memiliki akses ke profil kehamilan'),
      );

      await expect(
        service.findByProfile(
          profileId,
          { limit: 20, offset: 0, sort: PostpartumLogSort.DAY_ASC },
          requester,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('allows admin detail reads through profile access validation', async () => {
    prisma.postpartumLog.findUnique.mockResolvedValue(evaluatedLog);
    const admin = {
      id: staffId,
      role: UserRole.ADMIN,
      puskesmas_id: null,
    };

    await expect(service.findOne(logId, admin)).resolves.toEqual(evaluatedLog);
    expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
      profileId,
      admin,
    );
  });

  it('throws when a postpartum log does not exist', async () => {
    prisma.postpartumLog.findUnique.mockResolvedValue(null);

    await expect(service.findOne(logId, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
