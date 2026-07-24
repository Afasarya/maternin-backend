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

  it('rejects malformed triage responses', async () => {
    httpService.post.mockReturnValue(
      of({ data: { risk_badge: 'merah', aggregate_score: '84' } }),
    );

    await expect(
      service.analyzeTriageSymptoms(payload, 'request-123'),
    ).rejects.toBeInstanceOf(AiServiceUnavailableException);
  });
});
