import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import {
  REMINDER_NOTIFICATION_DISPATCHER,
  REMINDERS_QUEUE,
  REMINDERS_SCAN_JOB,
  REMINDERS_SCAN_PATTERN,
  REMINDERS_SCHEDULER_ID,
} from './reminders.constants.js';
import { RemindersService, type DueReminder } from './reminders.service.js';

export interface ReminderNotificationDispatcher {
  dispatchReminder(reminder: DueReminder): Promise<void>;
}

@Processor(REMINDERS_QUEUE, { concurrency: 1 })
export class RemindersProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    private readonly remindersService: RemindersService,
    @InjectQueue(REMINDERS_QUEUE)
    private readonly remindersQueue: Queue,
    @Optional()
    @Inject(REMINDER_NOTIFICATION_DISPATCHER)
    private readonly notificationDispatcher?: ReminderNotificationDispatcher,
  ) {
    super();
  }

  async onModuleInit() {
    await this.remindersQueue.upsertJobScheduler(
      REMINDERS_SCHEDULER_ID,
      { pattern: REMINDERS_SCAN_PATTERN, tz: 'UTC' },
      {
        name: REMINDERS_SCAN_JOB,
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
    );
  }

  async process(job: Job) {
    if (job.name !== REMINDERS_SCAN_JOB) {
      throw new Error(`Job reminder tidak dikenal: ${job.name}`);
    }

    const dueReminders = await this.remindersService.getDueReminders();

    if (!this.notificationDispatcher) {
      if (dueReminders.length > 0) {
        this.logger.warn(
          `${dueReminders.length} reminder jatuh tempo menunggu NotificationsModule`,
        );
      }
      return { due_count: dueReminders.length, dispatched_count: 0 };
    }

    let dispatchedCount = 0;

    for (const reminder of dueReminders) {
      await this.notificationDispatcher.dispatchReminder(reminder);
      await this.remindersService.markSent(reminder.id);
      dispatchedCount += 1;
    }

    return {
      due_count: dueReminders.length,
      dispatched_count: dispatchedCount,
    };
  }
}
