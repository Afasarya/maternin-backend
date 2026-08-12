import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { RiskBadge } from '../constants/index.js';
import { AiServiceUnavailableException } from '../exceptions/ai-service-unavailable.exception.js';

export interface LatestAncPayload {
  systolic: number | null;
  diastolic: number | null;
  protein_urine: string | null;
  weight_kg: number | null;
  fundal_height_cm: number | null;
  platelet_count: number | null;
}

export interface TriageAnalysisPayload {
  pregnancy_profile_id: string;
  symptom_checkin_id: string;
  answers: Record<string, unknown>;
  conjunctiva_image_url: string | null;
  latest_anc: LatestAncPayload | null;
  has_preeclampsia_history: boolean;
  age_years: number | null;
  gestational_age_weeks: number | null;
  height_cm: number | null;
  bmi: number | null;
  existing_conditions: string[] | null;
  bidan_phone?: string;
}

export interface TriageAnalysisResponse {
  contract_version: string;
  status: 'completed' | 'unavailable';
  risk_badge: RiskBadge | null;
  aggregate_score: number | null;
  risk_factors: string[];
  recommendation_text: string;
  triage_score?: number;
  anemia_probability?: number | null;
  preeclampsia_probability?: number | null;
  model_status: 'loaded' | 'partial' | 'unavailable' | 'mock' | 'fallback';
  model_version: string | null;
  missing_features: string[];
  anemia_is_mock: boolean;
  alert_delivery_status: string;
  bidan_review_required: boolean;
  disclaimer: string;
  screening_not_diagnosis: true;
  evaluated_at: string;
}

export type CompletedTriageAnalysisResponse = TriageAnalysisResponse & {
  status: 'completed';
  risk_badge: RiskBadge;
  aggregate_score: number;
};

export const isCompletedTriageResponse = (
  response: TriageAnalysisResponse,
): response is CompletedTriageAnalysisResponse =>
  response.status === 'completed' &&
  response.risk_badge !== null &&
  response.aggregate_score !== null;

export interface PostpartumEvaluationResponse {
  red_flag_triggered: boolean;
  reason: string;
  mental_health_flag: boolean;
}

export interface ChatResponse {
  reply: string;
  disclaimer_included: boolean;
}

export interface ChatPayload {
  pregnancy_profile_id: string;
  message: string;
}

export interface TrendPredictPayload {
  pregnancy_profile_id: string;
  score_history: Array<{
    aggregate_score: number;
    created_at: string;
  }>;
}

export interface TrendPredictResponse {
  trend_direction: 'naik' | 'stabil' | 'turun';
  predicted_badge_in_days: number | null;
  predicted_badge: RiskBadge | null;
  confidence_note: string;
}

export interface BidanConfirmPayload {
  bidan_id: string;
  action: 'acknowledge' | 'override_badge' | 'dismiss';
  new_risk_badge?: RiskBadge;
  rationale?: string;
}

export interface BidanConfirmResponse {
  status: string;
  new_badge?: RiskBadge | null;
  audit_trail: 'logged';
}

export interface VisitBriefResponse {
  brief_text: string;
}
export interface NutritionResponse {
  calories: number | null;
  iron_mg: number | null;
  activity: string | null;
  confidence_score: number;
  parsed_items?: Array<{ name: string; portion_estimate: string }>;
  nutrition_per_item?: NutritionPerItem[];
  insight_text?: string | null;
}
export interface NutritionPerItem {
  name: string;
  portion_estimate: string;
  source: string;
  matched_as: string;
  portion_multiplier?: number;
  nutrition: {
    energi_kcal: number;
    protein_g: number;
    lemak_g: number;
    karbohidrat_g: number;
    zat_besi_mg: number;
    kalsium_mg: number;
    kategori: string;
    catatan_ibu_hamil: string | null;
  };
}
export interface NutritionTrendResponse {
  anomaly_detected: boolean;
  reason: string;
}
export interface HealthResponse {
  status: 'ok';
  service: string;
}

@Injectable()
export class AiServiceClient {
  private readonly baseUrl: string;
  private readonly internalToken: string;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.baseUrl = configService
      .getOrThrow<string>('AI_SERVICE_URL')
      .replace(/\/$/, '');
    this.internalToken =
      (typeof configService.get === 'function'
        ? configService.get<string>('AI_INTERNAL_SERVICE_TOKEN')
        : undefined) ??
      configService.getOrThrow<string>('INTERNAL_SERVICE_TOKEN');
  }

  async analyzeTriageSymptoms(
    payload: TriageAnalysisPayload,
    requestId: string,
  ): Promise<TriageAnalysisResponse> {
    const data = await this.post<unknown>(
      '/api/v1/triage/analyze',
      payload,
      requestId,
      payload.symptom_checkin_id,
      30_000,
    );

    const normalizedData = this.normalizeTriageAnalysisResponse(data);

    if (!this.isTriageAnalysisResponse(normalizedData)) {
      throw new AiServiceUnavailableException(
        'Respons analisis triage AI Service tidak valid',
      );
    }

    return normalizedData;
  }

  evaluatePostpartum(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<PostpartumEvaluationResponse> {
    return this.evaluatePostpartumResponse(payload, requestId);
  }

  private async evaluatePostpartumResponse(
    payload: Record<string, unknown>,
    requestId: string,
  ) {
    const data = await this.post<unknown>(
      '/api/v1/postpartum/evaluate',
      payload,
      requestId,
      undefined,
      10_000,
    );

    if (!this.isPostpartumEvaluationResponse(data)) {
      throw new AiServiceUnavailableException(
        'Respons evaluasi postpartum AI Service tidak valid',
      );
    }

    return data;
  }

  async chat(payload: ChatPayload, requestId: string): Promise<ChatResponse> {
    const data = await this.post<unknown>(
      '/api/v1/chat',
      payload,
      requestId,
      undefined,
      15_000,
    );

    if (!this.isChatResponse(data)) {
      throw new AiServiceUnavailableException(
        'Respons chat AI Service tidak valid',
      );
    }

    return data;
  }

  async predictTrend(
    payload: TrendPredictPayload,
    requestId: string,
  ): Promise<TrendPredictResponse> {
    const data = await this.post<unknown>(
      '/api/v1/trend/predict',
      payload,
      requestId,
      undefined,
      10_000,
    );

    if (!this.isTrendPredictResponse(data)) {
      throw new AiServiceUnavailableException(
        'Respons prediksi tren AI Service tidak valid',
      );
    }

    return data;
  }

  async bidanConfirm(
    triageId: string,
    payload: BidanConfirmPayload,
    requestId: string,
  ) {
    const data = await this.post<unknown>(
      `/api/v1/triage/${triageId}/bidan-confirm`,
      payload,
      requestId,
      undefined,
      15_000,
    );
    if (!this.isBidanConfirmResponse(data))
      throw new AiServiceUnavailableException(
        'Respons konfirmasi bidan AI Service tidak valid',
      );
    return data;
  }

  async generateVisitBrief(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<VisitBriefResponse> {
    const data = await this.post<unknown>(
      '/api/v1/visit-brief/generate',
      payload,
      requestId,
      undefined,
      15_000,
    );
    if (!this.isNonEmptyStringObject(data, 'brief_text'))
      throw new AiServiceUnavailableException(
        'Respons visit brief AI Service tidak valid',
      );
    return data as VisitBriefResponse;
  }

  async parseNutrition(
    payload: { pregnancy_profile_id: string; raw_message: string },
    requestId: string,
  ): Promise<NutritionResponse> {
    const data = await this.post<unknown>(
      '/api/v1/nutrition/parse',
      {
        pregnancy_profile_id: payload.pregnancy_profile_id,
        // `message` adalah kontrak Task 18. `raw_message` dipertahankan
        // sementara agar kompatibel dengan deployment AI Service P2 lama.
        message: payload.raw_message,
        raw_message: payload.raw_message,
      },
      requestId,
      undefined,
      30_000,
    );
    const normalized = this.normalizeNutritionResponse(data);
    if (!normalized)
      throw new AiServiceUnavailableException(
        'Respons nutrisi AI Service tidak valid',
      );
    return normalized;
  }

  async evaluateNutritionTrend(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<NutritionTrendResponse> {
    const data = await this.post<unknown>(
      '/api/v1/nutrition/evaluate-trend', payload, requestId, undefined, 15_000,
    );
    if (!this.isNutritionTrendResponse(data))
      throw new AiServiceUnavailableException('Respons tren nutrisi AI Service tidak valid');
    return data;
  }

  async health(): Promise<HealthResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(`${this.baseUrl}/health`, {
          timeout: 5_000,
        }),
      );
      const data = response.data;
      if (
        typeof data !== 'object' ||
        data === null ||
        (data as Record<string, unknown>).status !== 'ok' ||
        typeof (data as Record<string, unknown>).service !== 'string'
      )
        throw new Error('invalid health response');
      return data as HealthResponse;
    } catch {
      throw new AiServiceUnavailableException('Health check AI Service gagal');
    }
  }

  private async post<T>(
    path: string,
    payload: unknown,
    requestId: string,
    idempotencyKey?: string,
    timeoutMs = 5_000,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(`${this.baseUrl}${path}`, payload, {
          timeout: timeoutMs,
          headers: {
            'X-Internal-Token': this.internalToken,
            'X-Request-Id': requestId,
            ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
          },
        }),
      );

      return response.data;
    } catch (error: unknown) {
      if (error instanceof AiServiceUnavailableException) {
        throw error;
      }

      if (
        error instanceof AxiosError &&
        (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
      ) {
        throw new AiServiceUnavailableException(
          `AI Service melewati batas waktu ${timeoutMs} milidetik`,
        );
      }

      if (error instanceof AxiosError && error.response) {
        const status = error.response.status;
        const retryable =
          status === 429 || [500, 502, 503, 504].includes(status);
        throw new AiServiceUnavailableException(
          retryable
            ? `AI Service gagal sementara (HTTP ${status})`
            : `AI Service menolak request (HTTP ${status})`,
          retryable,
          `AI_SERVICE_HTTP_${status}`,
        );
      }

      throw new AiServiceUnavailableException();
    }
  }

  private isTriageAnalysisResponse(
    value: unknown,
  ): value is TriageAnalysisResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const response = value as Record<string, unknown>;
    const validBadges = Object.values(RiskBadge) as unknown[];
    const validModelStatuses = [
      'loaded',
      'partial',
      'unavailable',
      'mock',
      'fallback',
    ];
    const isCompleted = response.status === 'completed';

    return (
      response.contract_version === 'triage.v1' &&
      ['completed', 'unavailable'].includes(response.status as string) &&
      (isCompleted
        ? validBadges.includes(response.risk_badge) &&
          this.isNumberInRange(response.aggregate_score, 0, 100) &&
          ['loaded', 'partial'].includes(response.model_status as string)
        : response.risk_badge === null && response.aggregate_score === null) &&
      Array.isArray(response.risk_factors) &&
      response.risk_factors.every((factor) => typeof factor === 'string') &&
      typeof response.recommendation_text === 'string' &&
      validModelStatuses.includes(response.model_status as string) &&
      (typeof response.model_version === 'string' ||
        response.model_version === null) &&
      Array.isArray(response.missing_features) &&
      response.missing_features.every((item) => typeof item === 'string') &&
      typeof response.anemia_is_mock === 'boolean' &&
      typeof response.alert_delivery_status === 'string' &&
      typeof response.bidan_review_required === 'boolean' &&
      typeof response.disclaimer === 'string' &&
      response.disclaimer.trim().length > 0 &&
      response.screening_not_diagnosis === true &&
      typeof response.evaluated_at === 'string' &&
      !Number.isNaN(Date.parse(response.evaluated_at)) &&
      this.isOptionalNumberInRange(response.triage_score, 0, 100) &&
      this.isOptionalNumberInRange(response.anemia_probability, 0, 1, true) &&
      this.isOptionalNumberInRange(
        response.preeclampsia_probability,
        0,
        1,
        true,
      )
    );
  }

  private normalizeTriageAnalysisResponse(value: unknown): unknown {
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    const response = value as Record<string, unknown>;
    const hasLiveResult =
      Object.values(RiskBadge).includes(response.risk_badge as RiskBadge) &&
      this.isNumberInRange(response.aggregate_score, 0, 100);

    if (!hasLiveResult) {
      return value;
    }

    return {
      ...response,
      contract_version: response.contract_version ?? 'triage.v1',
      status: response.status ?? 'completed',
      model_status: response.model_status ?? 'partial',
      model_version: response.model_version ?? null,
      missing_features: response.missing_features ?? [],
      evaluated_at: response.evaluated_at ?? new Date().toISOString(),
    };
  }

  private isPostpartumEvaluationResponse(
    value: unknown,
  ): value is PostpartumEvaluationResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const response = value as Record<string, unknown>;

    return (
      typeof response.red_flag_triggered === 'boolean' &&
      typeof response.reason === 'string' &&
      typeof response.mental_health_flag === 'boolean'
    );
  }

  private isChatResponse(value: unknown): value is ChatResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const response = value as Record<string, unknown>;

    return (
      typeof response.reply === 'string' &&
      response.reply.trim().length > 0 &&
      typeof response.disclaimer_included === 'boolean'
    );
  }

  private isTrendPredictResponse(
    value: unknown,
  ): value is TrendPredictResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const response = value as Record<string, unknown>;
    const validBadges = Object.values(RiskBadge) as unknown[];

    return (
      ['naik', 'stabil', 'turun'].includes(
        response.trend_direction as string,
      ) &&
      (response.predicted_badge_in_days === null ||
        (typeof response.predicted_badge_in_days === 'number' &&
          Number.isInteger(response.predicted_badge_in_days) &&
          response.predicted_badge_in_days >= 0)) &&
      (response.predicted_badge === null ||
        validBadges.includes(response.predicted_badge)) &&
      typeof response.confidence_note === 'string'
    );
  }

  private isBidanConfirmResponse(
    value: unknown,
  ): value is BidanConfirmResponse {
    if (typeof value !== 'object' || value === null) return false;
    const response = value as Record<string, unknown>;
    return (
      typeof response.status === 'string' &&
      response.audit_trail === 'logged' &&
      (response.new_badge === undefined ||
        response.new_badge === null ||
        Object.values(RiskBadge).includes(response.new_badge as RiskBadge))
    );
  }

  private isNonEmptyStringObject(value: unknown, key: string) {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>)[key] === 'string' &&
      ((value as Record<string, unknown>)[key] as string).trim().length > 0
    );
  }

  private isNutritionResponse(value: unknown): value is NutritionResponse {
    if (typeof value !== 'object' || value === null) return false;
    const response = value as Record<string, unknown>;
    return (
      (response.calories === null || this.isNumberInRange(response.calories, 0, 9999.99)) &&
      (response.iron_mg === null || this.isNumberInRange(response.iron_mg, 0, 9999.99)) &&
      (response.activity === null || typeof response.activity === 'string') &&
      this.isNumberInRange(response.confidence_score, 0, 1)
    );
  }

  private normalizeNutritionResponse(value: unknown): NutritionResponse | null {
    if (this.isNutritionResponse(value)) {
      return { ...value, parsed_items: value.parsed_items ?? [], nutrition_per_item: value.nutrition_per_item ?? [], insight_text: value.insight_text ?? null };
    }
    if (typeof value !== 'object' || value === null) return null;
    const response = value as Record<string, unknown>;
    if (!Array.isArray(response.parsed_items) ||
      !response.parsed_items.every((item) => typeof item === 'object' && item !== null &&
        typeof (item as Record<string, unknown>).name === 'string' &&
        typeof (item as Record<string, unknown>).portion_estimate === 'string') ||
      typeof response.insight_text !== 'string') return null;

    const nutritionPerItem = this.parseNutritionPerItem(response.nutrition_per_item);
    const calories = nutritionPerItem.length > 0
      ? this.roundNutritionTotal(nutritionPerItem.reduce((total, item) => total + item.nutrition.energi_kcal, 0))
      : null;
    const ironMg = nutritionPerItem.length > 0
      ? this.roundNutritionTotal(nutritionPerItem.reduce((total, item) => total + item.nutrition.zat_besi_mg, 0))
      : null;

    return {
      calories,
      iron_mg: ironMg,
      activity: null,
      confidence_score: nutritionPerItem.length > 0
        ? 0.9
        : response.parsed_items.length > 0 ? 0.8 : 0.3,
      parsed_items: response.parsed_items as Array<{ name: string; portion_estimate: string }>,
      nutrition_per_item: nutritionPerItem,
      insight_text: response.insight_text,
    };
  }

  private parseNutritionPerItem(value: unknown): NutritionPerItem[] {
    if (!Array.isArray(value)) return [];
    const validItems = value.filter((item): item is NutritionPerItem => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.nutrition !== 'object' || candidate.nutrition === null) return false;
      const nutrition = candidate.nutrition as Record<string, unknown>;
      return typeof candidate.name === 'string' &&
        typeof candidate.portion_estimate === 'string' &&
        typeof candidate.source === 'string' &&
        typeof candidate.matched_as === 'string' &&
        ['energi_kcal', 'protein_g', 'lemak_g', 'karbohidrat_g', 'zat_besi_mg', 'kalsium_mg']
          .every((key) => this.isNumberInRange(nutrition[key], 0, 99999)) &&
        typeof nutrition.kategori === 'string' &&
        (nutrition.catatan_ibu_hamil === null || typeof nutrition.catatan_ibu_hamil === 'string');
    });
    // Pertahankan item TKPI yang valid meski AI menyertakan item lain yang
    // belum match atau detailnya tidak lengkap. Satu item buruk tidak boleh
    // menghapus seluruh hasil nutrisi terverifikasi.
    return validItems.map((item) => {
      const multiplier = this.parsePortionMultiplier(item.portion_estimate);
      return {
        ...item,
        portion_multiplier: multiplier,
        nutrition: {
          ...item.nutrition,
          energi_kcal: this.roundNutritionTotal(item.nutrition.energi_kcal * multiplier),
          protein_g: this.roundNutritionTotal(item.nutrition.protein_g * multiplier),
          lemak_g: this.roundNutritionTotal(item.nutrition.lemak_g * multiplier),
          karbohidrat_g: this.roundNutritionTotal(item.nutrition.karbohidrat_g * multiplier),
          zat_besi_mg: this.roundNutritionTotal(item.nutrition.zat_besi_mg * multiplier),
          kalsium_mg: this.roundNutritionTotal(item.nutrition.kalsium_mg * multiplier),
        },
      };
    });
  }

  private parsePortionMultiplier(portion: string) {
    const normalized = portion.trim().toLowerCase().replace(',', '.');
    if (/^(½|setengah)\b/.test(normalized)) return 0.5;
    const fraction = normalized.match(/^(\d+)\s*\/\s*(\d+)/);
    if (fraction) {
      const denominator = Number(fraction[2]);
      return denominator > 0 ? Number(fraction[1]) / denominator : 1;
    }
    const numeric = normalized.match(/^(\d+(?:\.\d+)?)/);
    if (!numeric) return 1;
    const value = Number(numeric[1]);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  private roundNutritionTotal(value: number) {
    return Math.round(value * 100) / 100;
  }

  private isNutritionTrendResponse(value: unknown): value is NutritionTrendResponse {
    if (typeof value !== 'object' || value === null) return false;
    const response = value as Record<string, unknown>;
    return typeof response.anomaly_detected === 'boolean' && typeof response.reason === 'string';
  }

  private isOptionalNumberInRange(
    value: unknown,
    minimum: number,
    maximum: number,
    nullable = false,
  ) {
    return (
      value === undefined ||
      (nullable && value === null) ||
      this.isNumberInRange(value, minimum, maximum)
    );
  }

  private isNumberInRange(value: unknown, minimum: number, maximum: number) {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= minimum &&
      value <= maximum
    );
  }
}
