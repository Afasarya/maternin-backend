import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AncRecordsService } from '../anc-records/anc-records.service.js';
import {
  CheckinType,
  RiskBadge,
  SymptomSource,
  UserRole,
} from '../common/constants/index.js';
import { AiServiceUnavailableException } from '../common/exceptions/ai-service-unavailable.exception.js';
import { AiServiceClient } from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RiskAssessmentsService } from '../risk-assessments/risk-assessments.service.js';
import { TRIAGE_RETRY_JOB } from './symptom-checkins.constants.js';
import {
  SymptomCheckinsService,
  type TriageRetryJobData,
} from './symptom-checkins.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../anc-records/anc-records.service.js', () => ({
  AncRecordsService: class AncRecordsService {},
}));

jest.mock('../pregnancy-profiles/pregnancy-profiles.service.js', () => ({
  PregnancyProfilesService: class PregnancyProfilesService {},
}));

jest.mock('../risk-assessments/risk-assessments.service.js', () => ({
  RiskAssessmentsService: class RiskAssessmentsService {},
}));

describe('SymptomCheckinsService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const otherProfileId = '22222222-2222-4222-8222-222222222222';
  const patientId = '33333333-3333-4333-8333-333333333333';
  const otherPatientId = '44444444-4444-4444-8444-444444444444';
  const staffId = '55555555-5555-4555-8555-555555555555';
  const puskesmasId = '66666666-6666-4666-8666-666666666666';
  const otherPuskesmasId = '77777777-7777-4777-8777-777777777777';
  const checkinId = '88888888-8888-4888-8888-888888888888';
  const clientUuid = '99999999-9999-4999-8999-999999999999';
  const requestId = 'request-123';
  const profile = {
    id: profileId,
    user_id: patientId,
    had_preeclampsia_history: true,
    user: { puskesmas_id: puskesmasId },
  };
  const checkin = {
    id: checkinId,
    pregnancy_profile_id: profileId,
    checkin_type: CheckinType.PREGNANCY,
    answers: { sakit_kepala: 'berat', pandangan_kabur: false },
    conjunctiva_image_url: null,
    source: SymptomSource.SELF,
    client_uuid: clientUuid,
    created_at: new Date('2026-07-24T10:00:00.000Z'),
  };
  const latestAnc = {
    systolic: 145,
    diastolic: 95,
    protein_urine: 'positif',
  };
  const aiResponse = {
    risk_badge: RiskBadge.MERAH,
    aggregate_score: 84,
    risk_factors: ['Tekanan darah tinggi'],
    recommendation_text: 'Segera ke fasilitas kesehatan',
  };
  const assessment = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    pregnancy_profile_id: profileId,
    symptom_checkin_id: checkinId,
    ...aiResponse,
  };
  const patientRequester = {
    id: patientId,
    role: UserRole.IBU_HAMIL,
    puskesmas_id: puskesmasId,
  };
  const prisma = {
    symptomCheckin: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const aiServiceClient = {
    analyzeTriageSymptoms: jest.fn(),
  };
  const ancRecordsService = {
    findLatest: jest.fn(),
  };
  const pregnancyProfilesService = {
    findOne: jest.fn(),
  };
  const riskAssessmentsService = {
    findBySymptomCheckin: jest.fn(),
    createFromAiResponse: jest.fn(),
  };
  const triageRetryQueue = {
    add: jest.fn(),
  };
  const service = new SymptomCheckinsService(
    prisma as unknown as PrismaService,
    aiServiceClient as unknown as AiServiceClient,
    ancRecordsService as unknown as AncRecordsService,
    pregnancyProfilesService as unknown as PregnancyProfilesService,
    riskAssessmentsService as unknown as RiskAssessmentsService,
    triageRetryQueue as unknown as Queue<TriageRetryJobData>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    pregnancyProfilesService.findOne.mockResolvedValue(profile);
    riskAssessmentsService.findBySymptomCheckin.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );
  });

  describe('create', () => {
    it('creates a check-in, calls AI, and persists its assessment', async () => {
      prisma.symptomCheckin.findFirst.mockResolvedValue(null);
      prisma.symptomCheckin.create.mockResolvedValue(checkin);
      prisma.symptomCheckin.findUnique.mockResolvedValue(checkin);
      ancRecordsService.findLatest.mockResolvedValue(latestAnc);
      aiServiceClient.analyzeTriageSymptoms.mockResolvedValue(aiResponse);
      riskAssessmentsService.createFromAiResponse.mockResolvedValue(assessment);

      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: checkin.answers,
            client_uuid: clientUuid,
          },
          patientRequester,
          requestId,
        ),
      ).resolves.toEqual({
        created: true,
        data: { checkin, risk_assessment: assessment },
      });

      expect(prisma.symptomCheckin.create).toHaveBeenCalledWith({
        data: {
          pregnancy_profile_id: profileId,
          checkin_type: CheckinType.PREGNANCY,
          answers: checkin.answers,
          conjunctiva_image_url: undefined,
          source: SymptomSource.SELF,
          client_uuid: clientUuid,
        },
      });
      expect(aiServiceClient.analyzeTriageSymptoms).toHaveBeenCalledWith(
        {
          pregnancy_profile_id: profileId,
          symptom_checkin_id: checkinId,
          answers: checkin.answers,
          conjunctiva_image_url: null,
          latest_anc: latestAnc,
          has_preeclampsia_history: true,
        },
        requestId,
      );
      expect(riskAssessmentsService.createFromAiResponse).toHaveBeenCalledWith(
        profileId,
        checkinId,
        aiResponse,
      );
      expect(triageRetryQueue.add).not.toHaveBeenCalled();
    });

    it('returns processing and queues retry when AI is unavailable', async () => {
      prisma.symptomCheckin.create.mockResolvedValue(checkin);
      prisma.symptomCheckin.findUnique.mockResolvedValue(checkin);
      ancRecordsService.findLatest.mockResolvedValue(null);
      aiServiceClient.analyzeTriageSymptoms.mockRejectedValue(
        new AiServiceUnavailableException(),
      );
      triageRetryQueue.add.mockResolvedValue({ id: checkinId });

      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: checkin.answers,
          },
          patientRequester,
          requestId,
        ),
      ).resolves.toEqual({
        created: true,
        data: {
          checkin,
          status: 'processing',
          message: 'Sedang diproses',
        },
      });

      expect(triageRetryQueue.add).toHaveBeenCalledWith(
        TRIAGE_RETRY_JOB,
        { checkin_id: checkinId, request_id: requestId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          jobId: checkinId,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    });

    it('returns the existing assessment for a repeated client_uuid', async () => {
      prisma.symptomCheckin.findFirst.mockResolvedValue(checkin);
      riskAssessmentsService.findBySymptomCheckin.mockResolvedValue(assessment);

      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: checkin.answers,
            client_uuid: clientUuid,
          },
          patientRequester,
          requestId,
        ),
      ).resolves.toEqual({
        created: false,
        data: { checkin, risk_assessment: assessment },
      });

      expect(prisma.symptomCheckin.create).not.toHaveBeenCalled();
      expect(aiServiceClient.analyzeTriageSymptoms).not.toHaveBeenCalled();
    });

    it('replaces a newer offline check-in and recalculates its assessment', async () => {
      const updatedCheckin = {
        ...checkin,
        answers: { sakit_kepala: 'ringan' },
        source: SymptomSource.KADER_OFFLINE,
        created_at: new Date('2026-07-24T11:00:00.000Z'),
      };
      const updatedAssessment = {
        ...assessment,
        risk_badge: RiskBadge.KUNING,
      };
      prisma.symptomCheckin.findFirst.mockResolvedValue(checkin);
      prisma.symptomCheckin.update.mockResolvedValue(updatedCheckin);
      prisma.symptomCheckin.findUnique.mockResolvedValue(updatedCheckin);
      ancRecordsService.findLatest.mockResolvedValue(null);
      aiServiceClient.analyzeTriageSymptoms.mockResolvedValue({
        ...aiResponse,
        risk_badge: RiskBadge.KUNING,
      });
      riskAssessmentsService.createFromAiResponse.mockResolvedValue(
        updatedAssessment,
      );

      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: updatedCheckin.answers,
            client_uuid: clientUuid,
          },
          {
            id: staffId,
            role: UserRole.KADER,
            puskesmas_id: puskesmasId,
          },
          requestId,
          {
            replaceExisting: true,
            createdAt: new Date('2026-07-24T11:00:00.000Z'),
          },
        ),
      ).resolves.toEqual({
        created: false,
        data: {
          checkin: updatedCheckin,
          risk_assessment: updatedAssessment,
        },
      });

      expect(prisma.symptomCheckin.update).toHaveBeenCalledWith({
        where: { id: checkinId },
        data: {
          checkin_type: CheckinType.PREGNANCY,
          answers: updatedCheckin.answers,
          conjunctiva_image_url: null,
          source: SymptomSource.KADER_OFFLINE,
          created_at: new Date('2026-07-24T11:00:00.000Z'),
        },
      });
      expect(riskAssessmentsService.createFromAiResponse).toHaveBeenCalledWith(
        profileId,
        checkinId,
        { ...aiResponse, risk_badge: RiskBadge.KUNING },
        true,
      );
    });

    it('preserves LWW assessment replacement intent in an AI retry job', async () => {
      const updatedCheckin = {
        ...checkin,
        answers: { sakit_kepala: 'ringan' },
        source: SymptomSource.KADER_OFFLINE,
        created_at: new Date('2026-07-24T11:00:00.000Z'),
      };
      prisma.symptomCheckin.findFirst.mockResolvedValue(checkin);
      prisma.symptomCheckin.update.mockResolvedValue(updatedCheckin);
      prisma.symptomCheckin.findUnique.mockResolvedValue(updatedCheckin);
      ancRecordsService.findLatest.mockResolvedValue(null);
      aiServiceClient.analyzeTriageSymptoms.mockRejectedValue(
        new AiServiceUnavailableException(),
      );
      triageRetryQueue.add.mockResolvedValue({ id: checkinId });

      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: updatedCheckin.answers,
            client_uuid: clientUuid,
          },
          {
            id: staffId,
            role: UserRole.KADER,
            puskesmas_id: puskesmasId,
          },
          requestId,
          {
            replaceExisting: true,
            createdAt: updatedCheckin.created_at,
          },
        ),
      ).resolves.toEqual({
        created: false,
        data: {
          checkin: updatedCheckin,
          status: 'processing',
          message: 'Sedang diproses',
        },
      });

      expect(triageRetryQueue.add).toHaveBeenCalledWith(
        TRIAGE_RETRY_JOB,
        {
          checkin_id: checkinId,
          request_id: requestId,
          replace_existing_assessment: true,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          jobId: checkinId,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    });

    it('queues an unprocessed idempotent check-in without duplicating it', async () => {
      prisma.symptomCheckin.findFirst.mockResolvedValue(checkin);
      triageRetryQueue.add.mockResolvedValue({ id: checkinId });

      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: checkin.answers,
            client_uuid: clientUuid,
          },
          patientRequester,
          requestId,
        ),
      ).resolves.toEqual({
        created: false,
        data: {
          checkin,
          status: 'processing',
          message: 'Sedang diproses',
        },
      });

      expect(prisma.symptomCheckin.create).not.toHaveBeenCalled();
      expect(triageRetryQueue.add).toHaveBeenCalledTimes(1);
    });

    it('rejects a client_uuid assigned to another profile', async () => {
      prisma.symptomCheckin.findFirst.mockResolvedValue({
        ...checkin,
        pregnancy_profile_id: otherProfileId,
      });

      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: checkin.answers,
            client_uuid: clientUuid,
          },
          patientRequester,
          requestId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns the concurrent unique-constraint winner', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        clientVersion: '7.9.0',
      });
      prisma.symptomCheckin.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(checkin);
      prisma.symptomCheckin.create.mockRejectedValue(uniqueError);
      riskAssessmentsService.findBySymptomCheckin.mockResolvedValue(assessment);

      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: checkin.answers,
            client_uuid: clientUuid,
          },
          patientRequester,
          requestId,
        ),
      ).resolves.toEqual({
        created: false,
        data: { checkin, risk_assessment: assessment },
      });
    });

    it('accepts kader input only within the same puskesmas', async () => {
      prisma.symptomCheckin.create.mockResolvedValue({
        ...checkin,
        source: SymptomSource.KADER_OFFLINE,
      });
      prisma.symptomCheckin.findUnique.mockResolvedValue({
        ...checkin,
        source: SymptomSource.KADER_OFFLINE,
      });
      ancRecordsService.findLatest.mockResolvedValue(null);
      aiServiceClient.analyzeTriageSymptoms.mockResolvedValue(aiResponse);
      riskAssessmentsService.createFromAiResponse.mockResolvedValue(assessment);

      await service.create(
        {
          pregnancy_profile_id: profileId,
          checkin_type: CheckinType.PREGNANCY,
          answers: checkin.answers,
        },
        {
          id: staffId,
          role: UserRole.KADER,
          puskesmas_id: puskesmasId,
        },
        requestId,
      );

      expect(prisma.symptomCheckin.create).toHaveBeenCalledWith({
        data: {
          pregnancy_profile_id: profileId,
          checkin_type: CheckinType.PREGNANCY,
          answers: checkin.answers,
          conjunctiva_image_url: undefined,
          source: SymptomSource.KADER_OFFLINE,
          client_uuid: undefined,
        },
      });
    });

    it('rejects a different patient owner', async () => {
      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: checkin.answers,
          },
          {
            id: otherPatientId,
            role: UserRole.IBU_HAMIL,
            puskesmas_id: puskesmasId,
          },
          requestId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects kader input outside its puskesmas', async () => {
      await expect(
        service.create(
          {
            pregnancy_profile_id: profileId,
            checkin_type: CheckinType.PREGNANCY,
            answers: checkin.answers,
          },
          {
            id: staffId,
            role: UserRole.KADER,
            puskesmas_id: otherPuskesmasId,
          },
          requestId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('read', () => {
    it('lists check-ins newest first with pagination', async () => {
      prisma.symptomCheckin.findMany.mockResolvedValue([checkin]);
      prisma.symptomCheckin.count.mockResolvedValue(1);

      await expect(
        service.findByProfile(
          profileId,
          { limit: 10, offset: 5 },
          patientRequester,
        ),
      ).resolves.toEqual({ data: [checkin], total: 1 });

      const where = { pregnancy_profile_id: profileId };
      expect(prisma.symptomCheckin.findMany).toHaveBeenCalledWith({
        where,
        orderBy: { created_at: 'desc' },
        skip: 5,
        take: 10,
      });
      expect(prisma.symptomCheckin.count).toHaveBeenCalledWith({ where });
      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        profileId,
        patientRequester,
      );
    });

    it('returns one check-in after access validation', async () => {
      prisma.symptomCheckin.findUnique.mockResolvedValue(checkin);

      await expect(
        service.findOne(checkinId, patientRequester),
      ).resolves.toEqual(checkin);

      expect(pregnancyProfilesService.findOne).toHaveBeenCalledWith(
        profileId,
        patientRequester,
      );
    });

    it('throws when one check-in does not exist', async () => {
      prisma.symptomCheckin.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(checkinId, patientRequester),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects another patient listing check-ins', async () => {
      const otherRequester = {
        id: otherPatientId,
        role: UserRole.IBU_HAMIL,
        puskesmas_id: puskesmasId,
      };
      pregnancyProfilesService.findOne.mockRejectedValue(
        new ForbiddenException('Tidak memiliki akses ke profil kehamilan'),
      );

      await expect(
        service.findByProfile(
          profileId,
          { limit: 20, offset: 0 },
          otherRequester,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.symptomCheckin.findMany).not.toHaveBeenCalled();
    });

    it('rejects another patient reading one check-in', async () => {
      const otherRequester = {
        id: otherPatientId,
        role: UserRole.IBU_HAMIL,
        puskesmas_id: puskesmasId,
      };
      prisma.symptomCheckin.findUnique.mockResolvedValue(checkin);
      pregnancyProfilesService.findOne.mockRejectedValue(
        new ForbiddenException('Tidak memiliki akses ke profil kehamilan'),
      );

      await expect(
        service.findOne(checkinId, otherRequester),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
