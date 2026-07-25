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
}

export interface TriageAnalysisPayload {
  pregnancy_profile_id: string;
  symptom_checkin_id: string;
  answers: Record<string, unknown>;
  conjunctiva_image_url: string | null;
  latest_anc: LatestAncPayload | null;
  has_preeclampsia_history: boolean;
}

export interface TriageAnalysisResponse {
  risk_badge: RiskBadge;
  aggregate_score: number;
  risk_factors: string[];
  recommendation_text: string;
  triage_score?: number;
  anemia_probability?: number | null;
  preeclampsia_probability?: number | null;
}

export interface PostpartumEvaluationResponse {
  red_flag_triggered: boolean;
  reason: string;
  mental_health_flag: boolean;
}

export interface ChatResponse {
  reply: string;
  disclaimer_included: boolean;
}

@Injectable()
export class AiServiceClient {
  private static readonly TIMEOUT_MS = 5000;
  private readonly baseUrl: string;
  private readonly internalToken: string;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.baseUrl = configService
      .getOrThrow<string>('AI_SERVICE_URL')
      .replace(/\/$/, '');
    this.internalToken = configService.getOrThrow<string>(
      'INTERNAL_SERVICE_TOKEN',
    );
  }

  async analyzeTriageSymptoms(
    payload: TriageAnalysisPayload,
    requestId: string,
  ): Promise<TriageAnalysisResponse> {
    const data = await this.post<unknown>(
      '/api/v1/triage/analyze',
      payload,
      requestId,
    );

    if (!this.isTriageAnalysisResponse(data)) {
      throw new AiServiceUnavailableException(
        'Respons analisis triage AI Service tidak valid',
      );
    }

    return data;
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
    );

    if (!this.isPostpartumEvaluationResponse(data)) {
      throw new AiServiceUnavailableException(
        'Respons evaluasi postpartum AI Service tidak valid',
      );
    }

    return data;
  }

  chat(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<ChatResponse> {
    return this.post<ChatResponse>('/api/v1/chat', payload, requestId);
  }

  private async post<T>(
    path: string,
    payload: unknown,
    requestId: string,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(`${this.baseUrl}${path}`, payload, {
          timeout: AiServiceClient.TIMEOUT_MS,
          headers: {
            'X-Internal-Token': this.internalToken,
            'X-Request-Id': requestId,
          },
        }),
      );

      return response.data;
    } catch (error: unknown) {
      if (error instanceof AiServiceUnavailableException) {
        throw error;
      }

      if (error instanceof AxiosError && error.code === 'ECONNABORTED') {
        throw new AiServiceUnavailableException(
          'AI Service melewati batas waktu 5 detik',
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

    return (
      validBadges.includes(response.risk_badge) &&
      this.isNumberInRange(response.aggregate_score, 0, 100) &&
      Array.isArray(response.risk_factors) &&
      response.risk_factors.every((factor) => typeof factor === 'string') &&
      typeof response.recommendation_text === 'string' &&
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
