import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { RiskBadge } from '../constants/index.js';
import { AiServiceUnavailableException } from '../exceptions/ai-service-unavailable.exception.js';
import { AiServiceClient } from './ai-service.client.js';

describe('AiServiceClient', () => {
  const httpService = { post: jest.fn(), get: jest.fn() };
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
    age_years: null,
    gestational_age_weeks: 24,
    height_cm: null,
    bmi: null,
    existing_conditions: [],
  };

  const provenance = {
    contract_version: 'triage.v1',
    status: 'completed',
    model_status: 'loaded',
    model_version: 'risk_aggregator_v1.pkl',
    missing_features: [],
    anemia_is_mock: false,
    alert_delivery_status: 'not_triggered',
    bidan_review_required: false,
    disclaimer: 'Skrining bukan diagnosis.',
    screening_not_diagnosis: true,
    evaluated_at: '2026-08-08T00:00:00.000Z',
  };

  beforeEach(() => jest.clearAllMocks());

  it('calls triage with timeout and tracing headers', async () => {
    const response = {
      ...provenance,
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
        timeout: 30000,
        headers: {
          'X-Internal-Token': 'internal-token',
          'X-Request-Id': 'request-123',
          'Idempotency-Key': payload.symptom_checkin_id,
        },
      },
    );
  });

  it('normalizes the deployed compact triage contract', async () => {
    const response = {
      risk_badge: RiskBadge.KUNING,
      aggregate_score: 42,
      risk_factors: ['Tekanan darah tinggi'],
      recommendation_text: 'Lakukan pemeriksaan lanjutan.',
      triage_score: 40,
      anemia_probability: null,
      preeclampsia_probability: 0.45,
      anemia_is_mock: false,
      alert_delivery_status: 'not_triggered',
      bidan_review_required: false,
      disclaimer: 'Skrining bukan diagnosis.',
      screening_not_diagnosis: true,
    };
    httpService.post.mockReturnValue(of({ data: response }));

    const result = await service.analyzeTriageSymptoms(
      payload,
      'request-live-contract',
    );

    expect(result).toEqual(
      expect.objectContaining({
        ...response,
        contract_version: 'triage.v1',
        status: 'completed',
        model_status: 'partial',
        model_version: null,
        missing_features: [],
      }),
    );
    expect(typeof result.evaluated_at).toBe('string');
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
        timeout: 10000,
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
        timeout: 15000,
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
    ).rejects.toThrow('AI Service melewati batas waktu 15000 milidetik');
  });

  it('calls trend prediction and validates its response', async () => {
    const trendPayload = {
      pregnancy_profile_id: payload.pregnancy_profile_id,
      score_history: [
        { aggregate_score: 20, created_at: '2026-08-01T00:00:00.000Z' },
        { aggregate_score: 35, created_at: '2026-08-08T00:00:00.000Z' },
      ],
    };
    const response = {
      trend_direction: 'naik' as const,
      predicted_badge_in_days: 3,
      predicted_badge: RiskBadge.KUNING,
      confidence_note: 'Prediksi berbasis 2 titik data.',
    };
    httpService.post.mockReturnValue(of({ data: response }));

    await expect(
      service.predictTrend(trendPayload, 'request-trend'),
    ).resolves.toEqual(response);

    expect(httpService.post).toHaveBeenCalledWith(
      'http://ai-service.example/api/v1/trend/predict',
      trendPayload,
      {
        timeout: 10000,
        headers: {
          'X-Internal-Token': 'internal-token',
          'X-Request-Id': 'request-trend',
        },
      },
    );
  });

  it('rejects malformed trend prediction responses', async () => {
    httpService.post.mockReturnValue(
      of({ data: { trend_direction: 'unknown' } }),
    );

    await expect(
      service.predictTrend(
        {
          pregnancy_profile_id: payload.pregnancy_profile_id,
          score_history: [
            { aggregate_score: 20, created_at: '2026-08-01T00:00:00.000Z' },
            { aggregate_score: 35, created_at: '2026-08-08T00:00:00.000Z' },
          ],
        },
        'request-trend',
      ),
    ).rejects.toBeInstanceOf(AiServiceUnavailableException);
  });

  it.each([
    [
      'bidan confirm',
      () =>
        service.bidanConfirm(
          payload.symptom_checkin_id,
          { bidan_id: payload.pregnancy_profile_id, action: 'acknowledge' },
          'request-bidan',
        ),
      '/api/v1/triage/22222222-2222-4222-8222-222222222222/bidan-confirm',
      15000,
    ],
    [
      'visit brief',
      () =>
        service.generateVisitBrief(
          {
            pregnancy_profile_id: payload.pregnancy_profile_id,
            anc_history: [],
            risk_assessments: [],
            postpartum_logs: [],
          },
          'request-brief',
        ),
      '/api/v1/visit-brief/generate',
      15000,
    ],
    [
      'nutrition',
      () =>
        service.parseNutrition(
          {
            pregnancy_profile_id: payload.pregnancy_profile_id,
            raw_message: 'nasi 2 centong',
          },
          'request-nutrition',
        ),
      '/api/v1/nutrition/parse',
      30000,
    ],
  ])(
    'uses guide timeout for %s endpoint',
    async (_name, invoke, path, timeout) => {
      const responseByPath: Record<string, unknown> = {
        '/api/v1/triage/22222222-2222-4222-8222-222222222222/bidan-confirm': {
          status: 'acknowledged',
          audit_trail: 'logged',
        },
        '/api/v1/visit-brief/generate': { brief_text: 'Ringkasan kunjungan.' },
        '/api/v1/nutrition/parse': {
          calories: 320,
          iron_mg: 1.2,
          activity: null,
          confidence_score: 0.87,
        },
      };
      httpService.post.mockReturnValue(of({ data: responseByPath[path] }));

      await expect(invoke()).resolves.toEqual(
        path === '/api/v1/nutrition/parse'
          ? { ...(responseByPath[path] as object), parsed_items: [], nutrition_per_item: [], insight_text: null }
          : responseByPath[path],
      );
      expect(httpService.post).toHaveBeenCalledWith(
        `http://ai-service.example${path}`,
        expect.any(Object),
        expect.objectContaining({ timeout }),
      );
    },
  );

  it('rejects malformed triage responses', async () => {
    httpService.post.mockReturnValue(
      of({ data: { risk_badge: 'merah', aggregate_score: '84' } }),
    );

    await expect(
      service.analyzeTriageSymptoms(payload, 'request-123'),
    ).rejects.toBeInstanceOf(AiServiceUnavailableException);
  });

  it('normalizes the deployed P2 nutrition response without inventing nutrient values', async () => {
    httpService.post.mockReturnValue(of({ data: {
      parsed_items: [{ name: 'nasi', portion_estimate: '1 piring' }],
      insight_text: 'Estimasi kasar.',
    } }));

    await expect(service.parseNutrition({
      pregnancy_profile_id: payload.pregnancy_profile_id,
      raw_message: 'makan nasi satu piring',
    }, 'request-p2')).resolves.toEqual({
      calories: null,
      iron_mg: null,
      activity: null,
      confidence_score: 0.8,
      parsed_items: [{ name: 'nasi', portion_estimate: '1 piring' }],
      nutrition_per_item: [],
      insight_text: 'Estimasi kasar.',
    });
    expect(httpService.post).toHaveBeenCalledWith(
      'http://ai-service.example/api/v1/nutrition/parse',
      expect.objectContaining({
        message: 'makan nasi satu piring',
        raw_message: 'makan nasi satu piring',
      }),
      expect.any(Object),
    );
  });

  it('aggregates calories and iron from validated AI nutrition-per-item data', async () => {
    httpService.post.mockReturnValue(of({ data: {
      parsed_items: [
        { name: 'nasi goreng', portion_estimate: '1 piring' },
        { name: 'telur ceplok', portion_estimate: '1 butir' },
      ],
      nutrition_per_item: [
        { name: 'nasi goreng', portion_estimate: '1 piring', source: 'tkpi_dataset', matched_as: 'Nasi Putih', nutrition: { energi_kcal: 130, protein_g: 2.4, lemak_g: 0.2, karbohidrat_g: 28.6, zat_besi_mg: 0.2, kalsium_mg: 25, kategori: 'Makanan Pokok', catatan_ibu_hamil: 'Aman' } },
        { name: 'telur ceplok', portion_estimate: '1 butir', source: 'tkpi_dataset', matched_as: 'Telur Ayam Rebus', nutrition: { energi_kcal: 77, protein_g: 6.3, lemak_g: 5.3, karbohidrat_g: 0.6, zat_besi_mg: 1.2, kalsium_mg: 25, kategori: 'Lauk Pauk', catatan_ibu_hamil: null } },
      ],
      insight_text: 'Estimasi asupan.',
    } }));

    await expect(service.parseNutrition({
      pregnancy_profile_id: payload.pregnancy_profile_id,
      raw_message: 'nasi goreng dan telur',
    }, 'request-detailed')).resolves.toEqual(expect.objectContaining({
      calories: 207,
      iron_mg: 1.4,
      confidence_score: 0.9,
      nutrition_per_item: expect.arrayContaining([
        expect.objectContaining({ name: 'nasi goreng' }),
        expect.objectContaining({ name: 'telur ceplok' }),
      ]),
    }));
  });

  it('keeps valid TKPI items when another nutrition item is malformed', async () => {
    httpService.post.mockReturnValue(of({ data: {
      parsed_items: [
        { name: 'nasi putih', portion_estimate: '1 piring' },
        { name: 'makanan asing', portion_estimate: '1 porsi' },
      ],
      nutrition_per_item: [
        { name: 'nasi putih', portion_estimate: '1 piring', source: 'tkpi_dataset', matched_as: 'Nasi Putih', nutrition: { energi_kcal: 130, protein_g: 2.4, lemak_g: 0.2, karbohidrat_g: 28.6, zat_besi_mg: 0.2, kalsium_mg: 25, kategori: 'Makanan Pokok', catatan_ibu_hamil: null } },
        { name: 'makanan asing', portion_estimate: '1 porsi', source: 'unmatched', matched_as: '', nutrition: null },
      ],
      insight_text: 'Estimasi sebagian.',
    } }));

    await expect(service.parseNutrition({
      pregnancy_profile_id: payload.pregnancy_profile_id,
      raw_message: 'nasi putih dan makanan asing',
    }, 'request-partial')).resolves.toEqual(expect.objectContaining({
      calories: 130,
      iron_mg: 0.2,
      nutrition_per_item: [expect.objectContaining({ name: 'nasi putih' })],
    }));
  });

  it('multiplies TKPI nutrition when portion estimate is five portions', async () => {
    httpService.post.mockReturnValue(of({ data: {
      parsed_items: [{ name: 'nasi putih', portion_estimate: '5 porsi' }],
      nutrition_per_item: [{
        name: 'nasi putih', portion_estimate: '5 porsi', source: 'tkpi_dataset', matched_as: 'Nasi Putih',
        nutrition: { energi_kcal: 130, protein_g: 2.4, lemak_g: 0.2, karbohidrat_g: 28.6, zat_besi_mg: 0.2, kalsium_mg: 25, kategori: 'Makanan Pokok', catatan_ibu_hamil: null },
      }],
      insight_text: 'Estimasi lima porsi.',
    } }));

    await expect(service.parseNutrition({
      pregnancy_profile_id: payload.pregnancy_profile_id,
      raw_message: 'makan nasi putih 5 porsi',
    }, 'request-five-portions')).resolves.toEqual(expect.objectContaining({
      calories: 650,
      iron_mg: 1,
      nutrition_per_item: [expect.objectContaining({
        portion_multiplier: 5,
        nutrition: expect.objectContaining({ protein_g: 12, kalsium_mg: 125 }),
      })],
    }));
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
          ...provenance,
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
