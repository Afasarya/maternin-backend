import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { RiskBadge } from '../constants/index.js';
import { AiServiceUnavailableException } from '../exceptions/ai-service-unavailable.exception.js';
import { AiServiceClient } from './ai-service.client.js';

describe('AiServiceClient', () => {
  const httpService = { post: jest.fn() };
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'AI_SERVICE_URL') {
        return 'http://ai-service.example/';
      }

      if (key === 'INTERNAL_SERVICE_TOKEN') {
        return 'internal-token';
      }

      throw new Error(`Config tidak dikenal: ${key}`);
    }),
  };
  const service = new AiServiceClient(
    httpService as unknown as HttpService,
    configService as unknown as ConfigService,
  );
  const payload = {
    pregnancy_profile_id: '11111111-1111-4111-8111-111111111111',
    symptom_checkin_id: '22222222-2222-4222-8222-222222222222',
    answers: { sakit_kepala: 'berat' },
    conjunctiva_image_url: null,
    latest_anc: { systolic: 145, diastolic: 95, protein_urine: 'positif' },
    has_preeclampsia_history: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('calls triage with timeout and tracing headers', async () => {
    const response = {
      risk_badge: RiskBadge.MERAH,
      aggregate_score: 84,
      risk_factors: ['Tekanan darah tinggi'],
      recommendation_text: 'Segera ke fasilitas kesehatan',
    };
    httpService.post.mockReturnValue(of({ data: response }));

    await expect(
      service.analyzeTriageSymptoms(payload, 'request-123'),
    ).resolves.toEqual(response);

    expect(httpService.post).toHaveBeenCalledWith(
      'http://ai-service.example/api/v1/triage/analyze',
      payload,
      {
        timeout: 5000,
        headers: {
          'X-Internal-Token': 'internal-token',
          'X-Request-Id': 'request-123',
        },
      },
    );
  });

  it('maps timeout errors to AiServiceUnavailableException', async () => {
    const timeoutError = new AxiosError('timeout', 'ECONNABORTED');
    httpService.post.mockReturnValue(throwError(() => timeoutError));

    await expect(
      service.analyzeTriageSymptoms(payload, 'request-123'),
    ).rejects.toBeInstanceOf(AiServiceUnavailableException);
  });

  it('calls postpartum evaluation with timeout and tracing headers', async () => {
    const postpartumPayload = {
      pregnancy_profile_id: payload.pregnancy_profile_id,
      postpartum_log: {
        id: '33333333-3333-4333-8333-333333333333',
        day_number: 3,
        bleeding_level: 'normal',
        fever: false,
        wound_condition: 'baik',
        headache_severe: false,
        mood_flag: 'baik',
      },
      had_preeclampsia_history: false,
    };
    const response = {
      red_flag_triggered: false,
      reason: 'Tidak ada red flag',
      mental_health_flag: false,
    };
    httpService.post.mockReturnValue(of({ data: response }));

    await expect(
      service.evaluatePostpartum(postpartumPayload, 'request-postpartum'),
    ).resolves.toEqual(response);

    expect(httpService.post).toHaveBeenCalledWith(
      'http://ai-service.example/api/v1/postpartum/evaluate',
      postpartumPayload,
      {
        timeout: 5000,
        headers: {
          'X-Internal-Token': 'internal-token',
          'X-Request-Id': 'request-postpartum',
        },
      },
    );
  });

  it('rejects malformed postpartum responses', async () => {
    httpService.post.mockReturnValue(
      of({ data: { red_flag_triggered: 'false' } }),
    );

    await expect(
      service.evaluatePostpartum({}, 'request-postpartum'),
    ).rejects.toBeInstanceOf(AiServiceUnavailableException);
  });

  it('calls chat with timeout and tracing headers', async () => {
    const chatPayload = {
      pregnancy_profile_id: payload.pregnancy_profile_id,
      message: 'Apakah pusing saat hamil normal?',
    };
    const response = {
      reply: 'Pusing perlu dipantau. Hubungi tenaga kesehatan bila memburuk.',
      disclaimer_included: true,
    };
    httpService.post.mockReturnValue(of({ data: response }));

    await expect(service.chat(chatPayload, 'request-chat')).resolves.toEqual(
      response,
    );

    expect(httpService.post).toHaveBeenCalledWith(
      'http://ai-service.example/api/v1/chat',
      chatPayload,
      {
        timeout: 5000,
        headers: {
          'X-Internal-Token': 'internal-token',
          'X-Request-Id': 'request-chat',
        },
      },
    );
  });

  it.each([
    null,
    {},
    { reply: 123, disclaimer_included: true },
    { reply: 'Jawaban', disclaimer_included: 'true' },
    { reply: '   ', disclaimer_included: true },
  ])('rejects malformed chat responses: %o', async (response) => {
    httpService.post.mockReturnValue(of({ data: response }));

    await expect(
      service.chat(
        {
          pregnancy_profile_id: payload.pregnancy_profile_id,
          message: 'Pertanyaan',
        },
        'request-chat',
      ),
    ).rejects.toBeInstanceOf(AiServiceUnavailableException);
  });

  it('maps ETIMEDOUT chat errors to AiServiceUnavailableException', async () => {
    httpService.post.mockReturnValue(
      throwError(() => new AxiosError('timeout', 'ETIMEDOUT')),
    );

    await expect(
      service.chat(
        {
          pregnancy_profile_id: payload.pregnancy_profile_id,
          message: 'Pertanyaan',
        },
        'request-chat',
      ),
    ).rejects.toThrow('AI Service melewati batas waktu 5 detik');
  });

  it('rejects malformed triage responses', async () => {
    httpService.post.mockReturnValue(
      of({ data: { risk_badge: 'merah', aggregate_score: '84' } }),
    );

    await expect(
      service.analyzeTriageSymptoms(payload, 'request-123'),
    ).rejects.toBeInstanceOf(AiServiceUnavailableException);
  });

  it.each([
    { aggregate_score: 101 },
    { triage_score: -1 },
    { anemia_probability: 1.01 },
    { preeclampsia_probability: -0.01 },
  ])('rejects out-of-range triage values: %o', async (invalidValue) => {
    httpService.post.mockReturnValue(
      of({
        data: {
          risk_badge: RiskBadge.MERAH,
          aggregate_score: 84,
          risk_factors: ['Tekanan darah tinggi'],
          recommendation_text: 'Segera ke fasilitas kesehatan',
          ...invalidValue,
        },
      }),
    );

    await expect(
      service.analyzeTriageSymptoms(payload, 'request-123'),
    ).rejects.toBeInstanceOf(AiServiceUnavailableException);
  });
});
