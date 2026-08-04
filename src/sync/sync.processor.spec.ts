import type { Job } from 'bullmq';
import { UserRole } from '../common/constants/index.js';
import { SYNC_RETRY_JOB } from './sync.constants.js';
import { SyncProcessor } from './sync.processor.js';
import { SyncService, type SyncRetryJobData } from './sync.service.js';

jest.mock('./sync.service.js', () => ({
  SyncService: class SyncService {},
}));

describe('SyncProcessor', () => {
  const jobData: SyncRetryJobData = {
    client_uuid: '11111111-1111-4111-8111-111111111111',
    requester: {
      id: '22222222-2222-4222-8222-222222222222',
      role: UserRole.KADER,
      puskesmas_id: '33333333-3333-4333-8333-333333333333',
    },
    request_id: 'sync-request-id',
  };
  const syncService = { retryFailedRecord: jest.fn() };
  const processor = new SyncProcessor(syncService as unknown as SyncService);

  beforeEach(() => {
    jest.clearAllMocks();
    syncService.retryFailedRecord.mockResolvedValue({
      client_uuid: jobData.client_uuid,
      status: 'processed',
      server_id: '44444444-4444-4444-8444-444444444444',
    });
  });

  it('retries one failed queue record through SyncService', async () => {
    await expect(
      processor.process({
        name: SYNC_RETRY_JOB,
        data: jobData,
      } as Job<SyncRetryJobData>),
    ).resolves.toMatchObject({ status: 'processed' });

    expect(syncService.retryFailedRecord).toHaveBeenCalledWith(
      jobData.client_uuid,
      jobData.requester,
      jobData.request_id,
    );
  });

  it('rejects unknown jobs', async () => {
    await expect(
      processor.process({
        name: 'unknown',
        data: jobData,
      } as Job<SyncRetryJobData>),
    ).rejects.toThrow('Job sync tidak dikenal: unknown');
  });

  it('contains worker event handling before and at the final failure', () => {
    const error = new Error('still unavailable');

    expect(
      processor.onFailed(
        {
          data: jobData,
          attemptsMade: 2,
          opts: { attempts: 3 },
        } as Job<SyncRetryJobData>,
        error,
      ),
    ).toBeUndefined();
    expect(
      processor.onFailed(
        {
          data: jobData,
          attemptsMade: 3,
          opts: { attempts: 3 },
        } as Job<SyncRetryJobData>,
        error,
      ),
    ).toBeUndefined();
  });
});
