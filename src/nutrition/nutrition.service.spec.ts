import { AiServiceClient } from '../common/services/ai-service.client.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { NutritionService } from './nutrition.service.js';
import { UserRole } from '../common/constants/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatService } from '../chat/chat.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ConfigService } from '@nestjs/config';

describe('NutritionService', () => {
  const ai = { parseNutrition: jest.fn() };
  const profiles = { findOne: jest.fn() };
  const prisma = {
    user: { findFirst: jest.fn() },
    nutritionDailyLog: { upsert: jest.fn() },
    nutritionActivityLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const chat = { sendTrustedWebhookMessage: jest.fn() };
  const notifications = { sendNotification: jest.fn() };
  const service = new NutritionService(
    prisma as unknown as PrismaService,
    ai as unknown as AiServiceClient,
    profiles as unknown as PregnancyProfilesService,
    chat as unknown as ChatService,
    notifications as unknown as NotificationsService,
    { get: jest.fn().mockReturnValue(6) } as unknown as ConfigService,
  );
  const requester = {
    id: '22222222-2222-4222-8222-222222222222',
    role: UserRole.IBU_HAMIL,
    puskesmas_id: null,
  };
  const dto = {
    pregnancy_profile_id: '11111111-1111-4111-8111-111111111111',
    raw_message: 'hari ini makan nasi 2 centong dan sayur bayam',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.nutritionDailyLog.upsert.mockResolvedValue({
      id: 'daily-log-1', total_calories: 420, total_iron_mg: 3.5,
      total_protein_g: 0, total_calcium_mg: 0, entry_count: 1,
    });
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  it('checks profile access and returns guide-compliant estimated nutrition parsing', async () => {
    const parsed = { calories: 320, iron_mg: 1.2, activity: null, confidence_score: 0.87 };
    profiles.findOne.mockResolvedValue({ id: dto.pregnancy_profile_id });
    ai.parseNutrition.mockResolvedValue(parsed);

    await expect(
      service.parse(dto, requester, 'request-nutrition'),
    ).resolves.toEqual(parsed);
    expect(profiles.findOne).toHaveBeenCalledWith(
      dto.pregnancy_profile_id,
      requester,
    );
    expect(ai.parseNutrition).toHaveBeenCalledWith(dto, 'request-nutrition');
  });

  it('does not call AI when profile access fails', async () => {
    profiles.findOne.mockRejectedValue(new Error('forbidden'));
    await expect(
      service.parse(dto, requester, 'request-nutrition'),
    ).rejects.toThrow('forbidden');
    expect(ai.parseNutrition).not.toHaveBeenCalled();
  });

  it('acknowledges a confident nutrition report through WhatsApp', async () => {
    prisma.user.findFirst.mockResolvedValue({ pregnancy_profiles: [{
      id: dto.pregnancy_profile_id,
      nutrition_prompt_window: { window_closes_at: new Date(Date.now() + 60_000) },
    }] });
    ai.parseNutrition.mockResolvedValue({ calories: 420, iron_mg: 3.5, activity: 'jalan 20 menit', confidence_score: 0.9 });
    prisma.nutritionActivityLog.create.mockResolvedValue({ id: 'log-1', status: 'processed' });
    notifications.sendNotification.mockResolvedValue({ success: true });

    await expect(service.handleInbound({ sender: '6281328282288', message: dto.raw_message }, 'request-1'))
      .resolves.toEqual({ status: 'processed', log_id: 'log-1', reply_sent: true });
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'wa_patient', dto.pregnancy_profile_id, '+6281328282288',
      expect.stringContaining('sudah MaternIn catat'),
    );
    expect(chat.sendTrustedWebhookMessage).not.toHaveBeenCalled();
  });

  it('asks for clarification once when confidence is low', async () => {
    prisma.user.findFirst.mockResolvedValue({ pregnancy_profiles: [{
      id: dto.pregnancy_profile_id,
      nutrition_prompt_window: { window_closes_at: new Date(Date.now() + 60_000) },
    }] });
    ai.parseNutrition.mockResolvedValue({ calories: null, iron_mg: null, activity: null, confidence_score: 0.3 });
    prisma.nutritionActivityLog.create.mockResolvedValue({ id: 'log-2', status: 'low_confidence' });
    notifications.sendNotification.mockResolvedValue({ success: true });

    await service.handleInbound({ sender: '+6281328282288', message: 'makan biasa' }, 'request-2');
    expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'wa_patient', dto.pregnancy_profile_id, '+6281328282288',
      expect.stringContaining('belum cukup jelas'),
    );
    expect(chat.sendTrustedWebhookMessage).not.toHaveBeenCalled();
  });

  it('sends chat answer to WhatsApp outside prompt window', async () => {
    prisma.user.findFirst.mockResolvedValue({ pregnancy_profiles: [{
      id: dto.pregnancy_profile_id,
      nutrition_prompt_window: { window_closes_at: new Date(Date.now() - 60_000) },
    }] });
    chat.sendTrustedWebhookMessage.mockResolvedValue({ reply: 'Mual ringan cukup umum.', disclaimer_included: true });
    notifications.sendNotification.mockResolvedValue({ success: true });

    await expect(service.handleInbound({ sender: '081328282288', message: 'Apakah mual normal?' }, 'request-3'))
      .resolves.toEqual(expect.objectContaining({ status: 'forwarded_to_chat', reply_sent: true }));
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'wa_patient', dto.pregnancy_profile_id, '+6281328282288', 'Mual ringan cukup umum.',
    );
    expect(ai.parseNutrition).not.toHaveBeenCalled();
  });

  it('never replies to an unknown sender', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.nutritionActivityLog.create.mockResolvedValue({ id: 'log-unmatched' });

    await expect(service.handleInbound({ sender: '6289999999999', message: 'halo' }, 'request-4'))
      .resolves.toEqual({ status: 'ignored', sender_matched: false });
    expect(notifications.sendNotification).not.toHaveBeenCalled();
    expect(chat.sendTrustedWebhookMessage).not.toHaveBeenCalled();
    expect(ai.parseNutrition).not.toHaveBeenCalled();
  });

  it('retries processing when the existing provider message log failed', async () => {
    prisma.nutritionActivityLog.findUnique.mockResolvedValue({ id: 'failed-log', status: 'failed' });
    prisma.nutritionActivityLog.delete.mockResolvedValue({ id: 'failed-log' });
    prisma.user.findFirst.mockResolvedValue({ pregnancy_profiles: [{
      id: dto.pregnancy_profile_id,
      nutrition_prompt_window: { window_closes_at: new Date(Date.now() + 60_000) },
    }] });
    ai.parseNutrition.mockResolvedValue({ calories: 500, iron_mg: 4, activity: null, confidence_score: 0.9 });
    prisma.nutritionActivityLog.create.mockResolvedValue({ id: 'retry-log', status: 'processed' });
    notifications.sendNotification.mockResolvedValue({ success: true });

    await expect(service.handleInbound({
      sender: '6281328282288', message: dto.raw_message, inboxid: 208625777,
    }, 'request-retry')).resolves.toEqual({
      status: 'processed', log_id: 'retry-log', reply_sent: true,
    });
    expect(prisma.nutritionActivityLog.delete).toHaveBeenCalledWith({ where: { id: 'failed-log' } });
    expect(ai.parseNutrition).toHaveBeenCalled();
    expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('groups multiple meal entries into the same Jakarta daily log', async () => {
    prisma.user.findFirst.mockResolvedValue({ pregnancy_profiles: [{
      id: dto.pregnancy_profile_id,
      nutrition_prompt_window: { window_closes_at: new Date(Date.now() + 60_000) },
    }] });
    ai.parseNutrition.mockResolvedValue({
      calories: 250, iron_mg: 2, activity: null, confidence_score: 0.9,
      nutrition_per_item: [{ name: 'nasi', portion_estimate: '1 piring', source: 'tkpi', matched_as: 'Nasi', nutrition: { energi_kcal: 250, protein_g: 5, lemak_g: 1, karbohidrat_g: 50, zat_besi_mg: 2, kalsium_mg: 20, kategori: 'Pokok', catatan_ibu_hamil: null } }],
    });
    prisma.nutritionActivityLog.create.mockResolvedValue({ id: 'entry-1', status: 'processed' });
    notifications.sendNotification.mockResolvedValue({ success: true });

    await service.handleInbound({ sender: '6281328282288', message: 'sarapan nasi satu piring' }, 'daily-1');
    await service.handleInbound({ sender: '6281328282288', message: 'makan siang nasi satu piring' }, 'daily-2');

    const firstWhere = prisma.nutritionDailyLog.upsert.mock.calls[0][0].where;
    const secondWhere = prisma.nutritionDailyLog.upsert.mock.calls[1][0].where;
    expect(firstWhere).toEqual(secondWhere);
    expect(prisma.nutritionActivityLog.create).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ data: expect.objectContaining({ meal_period: 'breakfast', nutrition_daily_log_id: 'daily-log-1' }) }));
    expect(prisma.nutritionActivityLog.create).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ data: expect.objectContaining({ meal_period: 'lunch', nutrition_daily_log_id: 'daily-log-1' }) }));
  });
});
