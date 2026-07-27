import type { Queue } from 'bullmq';
import { ReminderStatus, ReminderType } from '../common/constants/index.js';
import {
  REMINDERS_SCAN_JOB,
  REMINDERS_SCAN_PATTERN,
  REMINDERS_SCHEDULER_ID,
} from './reminders.constants.js';
import { RemindersProcessor } from './reminders.processor.js';
import { RemindersService } from './reminders.service.js';

jest.mock('./reminders.service.js', () => ({
  RemindersService: class RemindersService {},
}));

describe('RemindersProcessor', () => {
  const reminder = {
    id: '11111111-1111-4111-8111-111111111111',
    pregnancy_profile_id: '22222222-2222-4222-8222-222222222222',
    reminder_type: ReminderType.ANC_CHECKUP,
    cadence_days: 14,
    next_trigger_at: new Date('2026-07-25T09:00:00.000Z'),
    last_sent_at: null,
    status: ReminderStatus.ACTIVE,
    pregnancy_profile: {
      id: '22222222-2222-4222-8222-222222222222',
      user: { id: '33333333-3333-4333-8333-333333333333' },
    },
  };
  const remindersService = {
    getDueReminders: jest.fn(),
    markSent: jest.fn(),
  };
  const queue = {
    upsertJobScheduler: jest.fn(),
  };
  const dispatcher = {
    dispatchReminder: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    remindersService.getDueReminders.mockResolvedValue([reminder]);
  });

  it('registers one idempotent hourly BullMQ scheduler', async () => {
    const processor = new RemindersProcessor(
      remindersService as unknown as RemindersService,
      queue as unknown as Queue,
    );

    await processor.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
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
  });

  it('reports due reminders without falsely marking sent before Task 12', async () => {
    const processor = new RemindersProcessor(
      remindersService as unknown as RemindersService,
      queue as unknown as Queue,
    );

    await expect(
      processor.process({ name: REMINDERS_SCAN_JOB } as never),
    ).resolves.toEqual({ due_count: 1, dispatched_count: 0 });
    expect(remindersService.markSent).not.toHaveBeenCalled();
  });

  it('dispatches then marks each reminder when a dispatcher is available', async () => {
    const processor = new RemindersProcessor(
      remindersService as unknown as RemindersService,
      queue as unknown as Queue,
      dispatcher,
    );

    await expect(
      processor.process({ name: REMINDERS_SCAN_JOB } as never),
    ).resolves.toEqual({ due_count: 1, dispatched_count: 1 });
    expect(dispatcher.dispatchReminder).toHaveBeenCalledWith(reminder);
    expect(remindersService.markSent).toHaveBeenCalledWith(reminder.id);
    expect(
      dispatcher.dispatchReminder.mock.invocationCallOrder[0],
    ).toBeLessThan(remindersService.markSent.mock.invocationCallOrder[0]);
  });

  it('does not mark sent if notification dispatch fails', async () => {
    dispatcher.dispatchReminder.mockRejectedValue(new Error('send failed'));
    const processor = new RemindersProcessor(
      remindersService as unknown as RemindersService,
      queue as unknown as Queue,
      dispatcher,
    );

    await expect(
      processor.process({ name: REMINDERS_SCAN_JOB } as never),
    ).rejects.toThrow('send failed');
    expect(remindersService.markSent).not.toHaveBeenCalled();
  });

  it('rejects unknown queue jobs', async () => {
    const processor = new RemindersProcessor(
      remindersService as unknown as RemindersService,
      queue as unknown as Queue,
    );

    await expect(
      processor.process({ name: 'unknown' } as never),
    ).rejects.toThrow('Job reminder tidak dikenal: unknown');
  });
});
