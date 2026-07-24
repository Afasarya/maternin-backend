import { Injectable } from '@nestjs/common';
import type { TriageAnalysisResponse } from '../common/services/ai-service.client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class RiskAssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromAiResponse(
    pregnancyProfileId: string,
    symptomCheckinId: string,
    aiResponse: TriageAnalysisResponse,
  ) {
    const existing = await this.findBySymptomCheckin(symptomCheckinId);

    if (existing) {
      return existing;
    }

    return this.prisma.riskAssessment.create({
      data: {
        pregnancy_profile_id: pregnancyProfileId,
        symptom_checkin_id: symptomCheckinId,
        // Kontrak triage publik hanya menjamin aggregate_score. Nilai itu
        // dipakai sebagai skor triage bila service belum mengirim skor terpisah.
        triage_score: aiResponse.triage_score ?? aiResponse.aggregate_score,
        anemia_probability: aiResponse.anemia_probability,
        preeclampsia_probability: aiResponse.preeclampsia_probability,
        aggregate_score: aiResponse.aggregate_score,
        risk_badge: aiResponse.risk_badge,
        risk_factors: aiResponse.risk_factors,
        recommendation_text: aiResponse.recommendation_text,
      },
    });
  }

  findBySymptomCheckin(symptomCheckinId: string) {
    return this.prisma.riskAssessment.findFirst({
      where: { symptom_checkin_id: symptomCheckinId },
      orderBy: { created_at: 'desc' },
    });
  }
}
