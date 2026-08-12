import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { NUTRITION_PROMPT_JOB, NUTRITION_QUEUE, NUTRITION_TREND_JOB } from './nutrition.constants.js';
import { NutritionService } from './nutrition.service.js';

@Processor(NUTRITION_QUEUE, { concurrency: 1 })
export class NutritionProcessor extends WorkerHost implements OnModuleInit {
  constructor(private readonly nutrition: NutritionService, @InjectQueue(NUTRITION_QUEUE) private readonly queue: Queue) { super(); }
  async onModuleInit() {
    // Reuses Task 11 BullMQ scheduler pattern. Asia/Jakarta keeps noon local.
    await this.queue.upsertJobScheduler('nutrition-prompt-noon-v1', { pattern: '0 12 * * *', tz: 'Asia/Jakarta' },
      { name: NUTRITION_PROMPT_JOB, data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: false } });
    await this.queue.upsertJobScheduler('nutrition-trend-night-v1', { pattern: '0 20 * * *', tz: 'Asia/Jakarta' },
      { name: NUTRITION_TREND_JOB, data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: false } });
  }
  process(job: Job) {
    if (job.name === NUTRITION_PROMPT_JOB) return this.nutrition.sendDailyPrompts();
    if (job.name === NUTRITION_TREND_JOB) return this.nutrition.evaluateTrends();
    throw new Error(`Job nutrition tidak dikenal: ${job.name}`);
  }
}