import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { ChatService } from '../chat/chat.service.js';
import { NotificationChannel } from '../common/constants/index.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { AiServiceUnavailableException } from '../common/exceptions/ai-service-unavailable.exception.js';
import { AiServiceClient } from '../common/services/ai-service.client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PregnancyProfilesService } from '../pregnancy-profiles/pregnancy-profiles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FonnteInboundDto } from './dto/fonnte-inbound.dto.js';
import { NutritionAnomalyCallbackDto } from './dto/nutrition-anomaly-callback.dto.js';
import { ParseNutritionDto } from './dto/parse-nutrition.dto.js';
import { QueryNutritionLogsDto } from './dto/query-nutrition-logs.dto.js';

const LOW_CONFIDENCE_THRESHOLD = 0.6;

@Injectable()
export class NutritionService {
  private readonly windowHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiServiceClient,
    private readonly profiles: PregnancyProfilesService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.windowHours = config.get<number>('NUTRITION_PROMPT_WINDOW_HOURS', 6);
  }

  async parse(dto: ParseNutritionDto, requester: CurrentUserData, requestId: string) {
    await this.profiles.findOne(dto.pregnancy_profile_id, requester);
    return this.ai.parseNutrition(dto, requestId);
  }

  async handleInbound(dto: FonnteInboundDto, requestId: string = randomUUID()) {
    const normalizedPhone = this.normalizePhone(dto.sender);
    const providerMessageId = dto.inboxid?.toString();
    if (providerMessageId) {
      const existing = await this.prisma.nutritionActivityLog.findUnique({
        where: { provider_message_id: providerMessageId },
        select: { id: true, status: true },
      });
      if (existing) {
        if (existing.status !== 'failed') {
          return { status: existing.status, log_id: existing.id, duplicate: true };
        }
        // Retry provider setelah kegagalan AI harus boleh memproses ulang.
        // Hapus audit failed lama agar unique provider_message_id dapat dipakai lagi.
        await this.prisma.nutritionActivityLog.delete({ where: { id: existing.id } });
      }
    }
    const user = await this.prisma.user.findFirst({
      where: { phone_number: { in: this.phoneCandidates(normalizedPhone) } },
      select: { pregnancy_profiles: {
        where: { status: 'hamil' }, orderBy: { created_at: 'desc' }, take: 1,
        select: { id: true, nutrition_prompt_window: true },
      } },
    });
    const profile = user?.pregnancy_profiles[0];
    if (!profile) {
      await this.prisma.nutritionActivityLog.create({ data: {
        provider_message_id: providerMessageId,
        raw_message: dto.message, sender_phone: normalizedPhone,
        sender_matched: false, status: 'unmatched_sender',
      } });
      // Privacy guardrail: unknown senders never reach AI/chat/Fonnte outbound.
      return { status: 'ignored', sender_matched: false };
    }

    const inWindow = profile.nutrition_prompt_window?.window_closes_at &&
      profile.nutrition_prompt_window.window_closes_at > new Date();
    if (!inWindow) {
      const chat = await this.chat.sendTrustedWebhookMessage(profile.id, dto.message, requestId);
      const reply = 'reply' in chat
        ? chat.reply
        : 'Pesan Ibu sudah diterima dan sedang diproses. Jawaban akan disiapkan sebentar lagi. 💛';
      const delivery = await this.notifications.sendNotification(
        NotificationChannel.WA_PATIENT,
        profile.id,
        normalizedPhone,
        reply,
      );
      return {
        status: 'forwarded_to_chat',
        reply_sent: delivery.success,
        chat,
      };
    }

    try {
      const parsed = await this.ai.parseNutrition(
        { pregnancy_profile_id: profile.id, raw_message: dto.message }, requestId,
      );
      const lowConfidence = parsed.confidence_score < LOW_CONFIDENCE_THRESHOLD;
      const mealPeriod = this.resolveMealPeriod(dto.message, new Date());
      const dailyTotals = this.resolveDailyTotals(parsed);
      const persisted = await this.prisma.$transaction(async (transaction) => {
        const daily = await transaction.nutritionDailyLog.upsert({
          where: { pregnancy_profile_id_log_date: {
            pregnancy_profile_id: profile.id,
            log_date: this.toJakartaDate(new Date()),
          } },
          create: {
            pregnancy_profile_id: profile.id,
            log_date: this.toJakartaDate(new Date()),
            timezone: 'Asia/Jakarta',
            total_calories: dailyTotals.calories,
            total_iron_mg: dailyTotals.ironMg,
            total_protein_g: dailyTotals.proteinG,
            total_calcium_mg: dailyTotals.calciumMg,
            entry_count: 1,
          },
          update: {
            total_calories: { increment: dailyTotals.calories },
            total_iron_mg: { increment: dailyTotals.ironMg },
            total_protein_g: { increment: dailyTotals.proteinG },
            total_calcium_mg: { increment: dailyTotals.calciumMg },
            entry_count: { increment: 1 },
          },
        });
        const entry = await transaction.nutritionActivityLog.create({ data: {
          provider_message_id: providerMessageId,
          pregnancy_profile_id: profile.id,
          nutrition_daily_log_id: daily.id,
          meal_period: mealPeriod,
          raw_message: dto.message,
          sender_phone: normalizedPhone, sender_matched: true,
          parsed_calories: parsed.calories, parsed_iron_mg: parsed.iron_mg,
          parsed_activity: parsed.activity, confidence_score: parsed.confidence_score,
          parsed_items: parsed.parsed_items ?? [],
          nutrition_per_item: (parsed.nutrition_per_item ?? []) as unknown as Prisma.InputJsonValue,
          insight_text: parsed.insight_text,
          status: lowConfidence ? 'low_confidence' : 'processed',
        } });
        return { entry, daily };
      });
      const log = persisted.entry;
      const reply = lowConfidence
        ? this.buildClarificationMessage()
        : this.buildNutritionAcknowledgement(parsed, mealPeriod, persisted.daily);
      const delivery = await this.notifications.sendNotification(
        NotificationChannel.WA_PATIENT,
        profile.id,
        normalizedPhone,
        reply,
      );
      return {
        status: log.status,
        log_id: log.id,
        reply_sent: delivery.success,
      };
    } catch (error: unknown) {
      await this.prisma.nutritionActivityLog.create({ data: {
        provider_message_id: providerMessageId,
        pregnancy_profile_id: profile.id, raw_message: dto.message,
        sender_phone: normalizedPhone, sender_matched: true, status: 'failed',
      } });
      throw error;
    }
  }

  async getLogs(query: QueryNutritionLogsDto, requester: CurrentUserData) {
    await this.profiles.findOne(query.pregnancy_profile_id, requester);
    const where = { pregnancy_profile_id: query.pregnancy_profile_id };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.nutritionActivityLog.findMany({
        where,
        include: { nutrition_daily_log: true },
        orderBy: { created_at: 'desc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.nutritionActivityLog.count({ where }),
    ]);
    return { data, total };
  }

  async handleAnomaly(dto: NutritionAnomalyCallbackDto) {
    if (!dto.anomaly_detected) return { notification_count: 0 };
    const profile = await this.prisma.pregnancyProfile.findUnique({
      where: { id: dto.pregnancy_profile_id },
      select: { user: { select: { full_name: true, puskesmas_id: true } } },
    });
    if (!profile) throw new NotFoundException('Profil kehamilan tidak ditemukan');
    if (!profile.user.puskesmas_id) return { notification_count: 0 };
    const midwives = await this.prisma.user.findMany({
      where: { role: 'bidan', puskesmas_id: profile.user.puskesmas_id },
      select: { phone_number: true },
    });
    const message = `[MaternIn] Anomali nutrisi pasien ${profile.user.full_name}: ${dto.reason}. Mohon ditindaklanjuti.`;
    await Promise.all(midwives.map((midwife) => this.notifications.sendNotification(
      NotificationChannel.WA_BIDAN, dto.pregnancy_profile_id, midwife.phone_number, message,
    )));
    return { notification_count: midwives.length };
  }

  async sendDailyPrompts() {
    const profiles = await this.prisma.pregnancyProfile.findMany({
      where: { status: 'hamil' },
      select: { id: true, hpht: true, user: { select: { full_name: true, phone_number: true } },
        nutrition_activity_logs: { where: { sender_matched: true }, orderBy: { created_at: 'desc' }, take: 7 } },
    });
    let sent = 0;
    for (const profile of profiles) {
      try {
        const generated = await this.ai.chat({ pregnancy_profile_id: profile.id,
          message: `Buat pesan WhatsApp harian untuk ibu hamil bernama ${profile.user.full_name}. Gunakan bahasa Indonesia yang hangat, suportif, personal, dan mudah dipahami; sapa dengan “Bu”, gunakan 1–2 emoji lembut, serta hindari nada kaku atau menggurui. Berikan satu rekomendasi nutrisi praktis dan satu aktivitas ringan yang aman, tanpa klaim diagnosis. Personalisasi berdasarkan HPHT ${profile.hpht.toISOString()} dan histori: ${JSON.stringify(profile.nutrition_activity_logs)}. Tutup dengan pertanyaan ramah yang mengajak Ibu membalas laporan makanan, minuman, atau aktivitas menggunakan bahasa sehari-hari. Panjang maksimal 90 kata.`,
        }, randomUUID());
        const result = await this.notifications.sendNotification(
          NotificationChannel.WA_PATIENT, profile.id, profile.user.phone_number, generated.reply,
        );
        if (result.success) { await this.openPromptWindow(profile.id); sent += 1; }
      } catch { /* Satu pasien gagal tidak menghentikan batch. */ }
    }
    return { profile_count: profiles.length, sent_count: sent };
  }

  async evaluateTrends() {
    const profiles = await this.prisma.pregnancyProfile.findMany({ where: { status: 'hamil' }, select: { id: true } });
    let anomalies = 0;
    for (const profile of profiles) {
      const history = await this.prisma.nutritionActivityLog.findMany({
        where: { pregnancy_profile_id: profile.id, sender_matched: true,
          created_at: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { created_at: 'asc' },
      });
      if (!history.length) continue;
      try {
        const result = await this.ai.evaluateNutritionTrend(
          { pregnancy_profile_id: profile.id, history }, randomUUID(),
        );
        if (result.anomaly_detected) {
          // PROVISIONAL: red flags/3-day nutrient thresholds require nutritionist/Sp.OG validation.
          await this.handleAnomaly({ pregnancy_profile_id: profile.id, ...result });
          anomalies += 1;
        }
      } catch (error) { if (!(error instanceof AiServiceUnavailableException)) throw error; }
    }
    return { evaluated_count: profiles.length, anomaly_count: anomalies };
  }

  private openPromptWindow(profileId: string) {
    const now = new Date();
    const closes = new Date(now.getTime() + this.windowHours * 3_600_000);
    return this.prisma.nutritionPromptWindow.upsert({
      where: { pregnancy_profile_id: profileId },
      create: { pregnancy_profile_id: profileId, last_prompt_sent_at: now, window_closes_at: closes },
      update: { last_prompt_sent_at: now, window_closes_at: closes },
    });
  }

  private buildNutritionAcknowledgement(parsed: {
    calories: number | null;
    iron_mg: number | null;
    activity: string | null;
    parsed_items?: Array<{ name: string; portion_estimate: string }>;
    nutrition_per_item?: Array<{
      name: string;
      nutrition: { protein_g: number; kalsium_mg: number; catatan_ibu_hamil: string | null };
    }>;
  }, mealPeriod: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'mixed', daily: {
    total_calories: unknown;
    total_iron_mg: unknown;
    total_protein_g: unknown;
    total_calcium_mg: unknown;
    entry_count: number;
  }) {
    const periodLabel = {
      breakfast: 'sarapan',
      lunch: 'makan siang',
      dinner: 'makan malam',
      snack: 'camilan',
      mixed: 'beberapa waktu makan',
    }[mealPeriod];
    const details = [
      parsed.calories !== null ? `• Perkiraan energi: ${parsed.calories} kkal` : null,
      parsed.iron_mg !== null ? `• Perkiraan zat besi: ${parsed.iron_mg} mg` : null,
      parsed.activity ? `• Aktivitas: ${parsed.activity}` : null,
      ...(parsed.parsed_items ?? []).map(
        (item) => `• ${item.name}: sekitar ${item.portion_estimate}`,
      ),
      parsed.nutrition_per_item?.length
        ? `• Protein total: ${this.sumNutrition(parsed.nutrition_per_item, 'protein_g')} g`
        : null,
      parsed.nutrition_per_item?.length
        ? `• Kalsium total: ${this.sumNutrition(parsed.nutrition_per_item, 'kalsium_mg')} mg`
        : null,
    ].filter((item): item is string => item !== null);

    return [
      `Terima kasih, Bu. Laporan ${periodLabel} sudah MaternIn catat. 🌷`,
      details.length > 0 ? details.join('\n') : 'Makanan atau aktivitas Ibu sudah masuk ke catatan harian.',
      [
        `Total hari ini dari ${daily.entry_count} laporan:`,
        `• Energi: ${Number(daily.total_calories)} kkal`,
        `• Zat besi: ${Number(daily.total_iron_mg)} mg`,
        `• Protein: ${Number(daily.total_protein_g)} g`,
        `• Kalsium: ${Number(daily.total_calcium_mg)} mg`,
      ].join('\n'),
      'Angka di atas berupa perkiraan, bukan pengukuran medis.',
      this.nextMealPrompt(mealPeriod),
    ].join('\n\n');
  }

  private nextMealPrompt(mealPeriod: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'mixed') {
    if (mealPeriod === 'breakfast') return 'Nanti setelah makan siang, Ibu boleh kirim laporan berikutnya dengan awalan “Makan siang…”. 💛';
    if (mealPeriod === 'lunch') return 'Kalau Ibu ngemil, tulis “Camilan…”; setelah makan malam, tulis “Makan malam…”. 💛';
    if (mealPeriod === 'snack') return 'Saat makan utama berikutnya, awali pesan dengan “Makan siang…” atau “Makan malam…”. 💛';
    if (mealPeriod === 'dinner') return 'Laporan makan hari ini sudah bertambah. Besok Ibu bisa mulai lagi dengan pesan “Sarapan…”. 💛';
    return 'Laporan beberapa waktu makan sudah dicatat. Berikutnya sebutkan “Sarapan”, “Makan siang”, “Camilan”, atau “Makan malam” agar lebih rapi. 💛';
  }

  private sumNutrition(
    items: Array<{ nutrition: { protein_g: number; kalsium_mg: number } }>,
    key: 'protein_g' | 'kalsium_mg',
  ) {
    return Math.round(items.reduce((sum, item) => sum + item.nutrition[key], 0) * 100) / 100;
  }

  private resolveDailyTotals(parsed: {
    calories: number | null;
    iron_mg: number | null;
    nutrition_per_item?: Array<{
      nutrition: { protein_g: number; kalsium_mg: number };
    }>;
  }) {
    return {
      calories: parsed.calories ?? 0,
      ironMg: parsed.iron_mg ?? 0,
      proteinG: this.sumNutrition(parsed.nutrition_per_item ?? [], 'protein_g'),
      calciumMg: this.sumNutrition(parsed.nutrition_per_item ?? [], 'kalsium_mg'),
    };
  }

  private resolveMealPeriod(message: string, receivedAt: Date) {
    const text = message.toLowerCase();
    const explicitPeriods = [
      /\b(sarapan|makan pagi|pagi)\b/.test(text) ? 'breakfast' : null,
      /\b(makan siang|siang)\b/.test(text) ? 'lunch' : null,
      /\b(makan malam|malam)\b/.test(text) ? 'dinner' : null,
      /\b(ngemil|nyemil|camilan|snack)\b/.test(text) ? 'snack' : null,
    ].filter((period): period is string => period !== null);
    if (explicitPeriods.length > 1) return 'mixed' as const;
    if (explicitPeriods.length === 1) return explicitPeriods[0] as 'breakfast' | 'lunch' | 'dinner' | 'snack';

    const jakartaHour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false,
    }).format(receivedAt));
    if (jakartaHour >= 4 && jakartaHour < 10) return 'breakfast' as const;
    if (jakartaHour >= 10 && jakartaHour < 15) return 'lunch' as const;
    if (jakartaHour >= 18 && jakartaHour <= 23) return 'dinner' as const;
    return 'snack' as const;
  }

  private toJakartaDate(value: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`);
  }

  private buildClarificationMessage() {
    return [
      'Terima kasih sudah membalas, Bu. 🌷',
      'Laporannya belum cukup jelas untuk dicatat dengan yakin. Boleh sebutkan makanan atau aktivitas beserta perkiraannya?',
      'Contoh: “makan nasi 1 piring, telur 1, lalu jalan santai 20 menit.”',
    ].join('\n\n');
  }

  private normalizePhone(value: string) {
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
    if (digits.startsWith('62')) return `+${digits}`;
    return `+${digits}`;
  }

  private phoneCandidates(normalized: string) {
    return [normalized, normalized.slice(1), `0${normalized.slice(3)}`];
  }
}
