import { RiskBadge } from '../common/constants/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RiskAssessmentsService } from './risk-assessments.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

describe('RiskAssessmentsService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const checkinId = '22222222-2222-4222-8222-222222222222';
  const assessment = {
    id: '33333333-3333-4333-8333-333333333333',
    pregnancy_profile_id: profileId,
    symptom_checkin_id: checkinId,
    triage_score: 84,
    aggregate_score: 84,
    risk_badge: RiskBadge.MERAH,
  };
  const prisma = {
    riskAssessment: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new RiskAssessmentsService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('persists a successful AI response', async () => {
    prisma.riskAssessment.findFirst.mockResolvedValue(null);
    prisma.riskAssessment.create.mockResolvedValue(assessment);

    await expect(
      service.createFromAiResponse(profileId, checkinId, {
        risk_badge: RiskBadge.MERAH,
        aggregate_score: 84,
        risk_factors: ['Tekanan darah tinggi'],
        recommendation_text: 'Segera ke fasilitas kesehatan',
      }),
    ).resolves.toEqual(assessment);

    expect(prisma.riskAssessment.create).toHaveBeenCalledWith({
      data: {
        pregnancy_profile_id: profileId,
        symptom_checkin_id: checkinId,
        triage_score: 84,
        anemia_probability: undefined,
        preeclampsia_probability: undefined,
        aggregate_score: 84,
        risk_badge: RiskBadge.MERAH,
        risk_factors: ['Tekanan darah tinggi'],
        recommendation_text: 'Segera ke fasilitas kesehatan',
      },
    });
  });

  it('returns an existing assessment without duplication', async () => {
    prisma.riskAssessment.findFirst.mockResolvedValue(assessment);

    await expect(
      service.createFromAiResponse(profileId, checkinId, {
        risk_badge: RiskBadge.MERAH,
        aggregate_score: 84,
        risk_factors: [],
        recommendation_text: 'Rekomendasi',
      }),
    ).resolves.toEqual(assessment);

    expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
  });
});
