import { ForbiddenException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AncRecordsService } from '../anc-records/anc-records.service.js';
import {
  CheckinType,
  SyncPayloadType,
  SyncStatus,
  UserRole,
} from '../common/constants/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SymptomCheckinsService } from '../symptom-checkins/symptom-checkins.service.js';
import { SYNC_RETRY_JOB } from './sync.constants.js';
import { SyncService, type SyncRetryJobData } from './sync.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../anc-records/anc-records.service.js', () => ({
  AncRecordsService: class AncRecordsService {},
}));

jest.mock('../symptom-checkins/symptom-checkins.service.js', () => ({
  SymptomCheckinsService: class SymptomCheckinsService {},
}));

describe('SyncService', () => {
  const deviceUuid = 'device-abc-123';
  const profileId = '11111111-1111-4111-8111-111111111111';
  const clientUuid = '22222222-2222-4222-8222-222222222222';
  const requester = {
    id: '33333333-3333-4333-8333-333333333333',
    role: UserRole.KADER,
    puskesmas_id: '44444444-4444-4444-8444-444444444444',
  };
  const requestId = 'request-sync-123';
  const ancPayload = {
    pregnancy_profile_id: profileId,
    systolic: 120,
    diastolic: 80,
    weight_kg: 62,
    recorded_at: '2026-07-20T09:00:00.000Z',
  };
  const makeQueueRecord = (
    overrides: Partial<{
      id: string;
      device_uuid: string;
      payload_type: SyncPayloadType;
      payload: Record<string, unknown>;
      client_created_at: Date;
      synced_at: Date | null;
      status: SyncStatus;
      client_uuid: string;
    }> = {},
  ) => ({
    id: '55555555-5555-4555-8555-555555555555',
    device_uuid: deviceUuid,
    payload_type: SyncPayloadType.ANC_RECORD,
    payload: ancPayload,
    client_created_at: new Date('2026-07-20T09:00:00.000Z'),
    synced_at: null,
    status: SyncStatus.PENDING,
    client_uuid: clientUuid,
    ...overrides,
  });
  const prisma = {
    syncQueue: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
  };
  const ancRecordsService = { create: jest.fn() };
  const symptomCheckinsService = { create: jest.fn() };
  const queue = { add: jest.fn() };
  const service = new SyncService(
    prisma as unknown as PrismaService,
    ancRecordsService as unknown as AncRecordsService,
    symptomCheckinsService as unknown as SymptomCheckinsService,
    queue as unknown as Queue<SyncRetryJobData>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.syncQueue.updateMany.mockResolvedValue({ count: 1 });
    queue.add.mockResolvedValue({ id: clientUuid });
  });

  it('processes three new records and records each queue entry', async () => {
    const records = [0, 1, 2].map((index) => ({
      client_uuid: `22222222-2222-4222-8222-22222222222${index}`,
      payload_type: SyncPayloadType.ANC_RECORD,
      payload: { ...ancPayload, systolic: 120 + index },
      client_created_at: `2026-07-20T09:0${index}:00.000Z`,
    }));
    prisma.syncQueue.findUnique.mockResolvedValue(null);
    prisma.syncQueue.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          makeQueueRecord({
            ...data,
            payload_type: data.payload_type as SyncPayloadType,
            payload: data.payload as Record<string, unknown>,
            client_created_at: data.client_created_at as Date,
            status: data.status as SyncStatus,
            client_uuid: data.client_uuid as string,
          }),
        ),
    );
    ancRecordsService.create.mockImplementation(
      (dto: { client_uuid: string }) =>
        Promise.resolve({
          created: true,
          record: { id: `server-${dto.client_uuid}` },
        }),
    );

    await expect(
      service.processBatch(
        { device_uuid: deviceUuid, records },
        requester,
        requestId,
      ),
    ).resolves.toEqual({
      created: true,
      data: {
        total_received: 3,
        processed: 3,
        skipped: 0,
        failed: 0,
        results: records.map((record) => ({
          client_uuid: record.client_uuid,
          status: 'processed',
          server_id: `server-${record.client_uuid}`,
        })),
      },
    });

    expect(ancRecordsService.create).toHaveBeenCalledTimes(3);
    expect(ancRecordsService.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        client_uuid: records[0].client_uuid,
        pregnancy_profile_id: profileId,
      }),
      requester,
      { replaceExisting: false },
    );
    expect(prisma.syncQueue.updateMany).toHaveBeenCalledTimes(3);
  });

  it('processes a mixed ANC and symptom batch through existing pipelines', async () => {
    const symptomClientUuid = '66666666-6666-4666-8666-666666666666';
    const records = [
      {
        client_uuid: clientUuid,
        payload_type: SyncPayloadType.ANC_RECORD,
        payload: ancPayload,
        client_created_at: '2026-07-20T09:00:00.000Z',
      },
      {
        client_uuid: symptomClientUuid,
        payload_type: SyncPayloadType.SYMPTOM_CHECKIN,
        payload: {
          pregnancy_profile_id: profileId,
          checkin_type: CheckinType.PREGNANCY,
          answers: { bengkak_kaki: true },
        },
        client_created_at: '2026-07-20T09:30:00.000Z',
      },
    ];
    prisma.syncQueue.findUnique.mockResolvedValue(null);
    prisma.syncQueue.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          makeQueueRecord({
            ...data,
            payload_type: data.payload_type as SyncPayloadType,
            payload: data.payload as Record<string, unknown>,
            client_created_at: data.client_created_at as Date,
            status: data.status as SyncStatus,
            client_uuid: data.client_uuid as string,
          }),
        ),
    );
    ancRecordsService.create.mockResolvedValue({
      created: true,
      record: { id: 'anc-server-id' },
    });
    symptomCheckinsService.create.mockResolvedValue({
      created: true,
      data: { checkin: { id: 'symptom-server-id' }, status: 'processing' },
    });

    const result = await service.processBatch(
      { device_uuid: deviceUuid, records },
      requester,
      requestId,
    );

    expect(result.data.processed).toBe(2);
    expect(ancRecordsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ client_uuid: clientUuid }),
      requester,
      { replaceExisting: false },
    );
    expect(symptomCheckinsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client_uuid: symptomClientUuid,
        checkin_type: CheckinType.PREGNANCY,
      }),
      requester,
      requestId,
      {
        replaceExisting: false,
        createdAt: new Date('2026-07-20T09:30:00.000Z'),
      },
    );
  });

  it('skips an equal-timestamp duplicate without reprocessing it', async () => {
    prisma.syncQueue.findUnique.mockResolvedValue(
      makeQueueRecord({ status: SyncStatus.PROCESSED }),
    );
    prisma.syncQueue.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.processBatch(
        {
          device_uuid: deviceUuid,
          records: [
            {
              client_uuid: clientUuid,
              payload_type: SyncPayloadType.ANC_RECORD,
              payload: ancPayload,
              client_created_at: '2026-07-20T09:00:00.000Z',
            },
          ],
        },
        requester,
        requestId,
      ),
    ).resolves.toEqual({
      created: false,
      data: {
        total_received: 1,
        processed: 0,
        skipped: 1,
        failed: 0,
        results: [
          {
            client_uuid: clientUuid,
            status: 'skipped',
            reason: 'duplicate',
          },
        ],
      },
    });

    expect(ancRecordsService.create).not.toHaveBeenCalled();
  });

  it('processes one new record and skips one duplicate in the same batch', async () => {
    const newClientUuid = '99999999-9999-4999-8999-999999999999';
    const duplicateQueueRecord = makeQueueRecord({
      status: SyncStatus.PROCESSED,
    });
    const newQueueRecord = makeQueueRecord({
      client_uuid: newClientUuid,
      payload: { ...ancPayload, systolic: 126 },
      client_created_at: new Date('2026-07-20T10:00:00.000Z'),
    });
    prisma.syncQueue.findUnique.mockImplementation(
      ({ where }: { where: { client_uuid: string } }) =>
        Promise.resolve(
          where.client_uuid === clientUuid ? duplicateQueueRecord : null,
        ),
    );
    prisma.syncQueue.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.syncQueue.create.mockResolvedValue(newQueueRecord);
    ancRecordsService.create.mockResolvedValue({
      created: true,
      record: { id: 'new-anc-server-id' },
    });

    await expect(
      service.processBatch(
        {
          device_uuid: deviceUuid,
          records: [
            {
              client_uuid: clientUuid,
              payload_type: SyncPayloadType.ANC_RECORD,
              payload: ancPayload,
              client_created_at: '2026-07-20T09:00:00.000Z',
            },
            {
              client_uuid: newClientUuid,
              payload_type: SyncPayloadType.ANC_RECORD,
              payload: { ...ancPayload, systolic: 126 },
              client_created_at: '2026-07-20T10:00:00.000Z',
            },
          ],
        },
        requester,
        requestId,
      ),
    ).resolves.toEqual({
      created: true,
      data: {
        total_received: 2,
        processed: 1,
        skipped: 1,
        failed: 0,
        results: [
          {
            client_uuid: clientUuid,
            status: 'skipped',
            reason: 'duplicate',
          },
          {
            client_uuid: newClientUuid,
            status: 'processed',
            server_id: 'new-anc-server-id',
          },
        ],
      },
    });

    expect(ancRecordsService.create).toHaveBeenCalledTimes(1);
    expect(ancRecordsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ client_uuid: newClientUuid, systolic: 126 }),
      requester,
      { replaceExisting: false },
    );
  });

  it('applies last-write-wins when the same client_uuid is newer', async () => {
    const newerPayload = { ...ancPayload, systolic: 135 };
    const updatedQueueRecord = makeQueueRecord({
      payload: newerPayload,
      client_created_at: new Date('2026-07-20T10:00:00.000Z'),
    });
    prisma.syncQueue.findUnique.mockResolvedValue(
      makeQueueRecord({ status: SyncStatus.PROCESSED }),
    );
    prisma.syncQueue.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.syncQueue.findUniqueOrThrow.mockResolvedValue(updatedQueueRecord);
    ancRecordsService.create.mockResolvedValue({
      created: false,
      record: { id: 'existing-anc-id' },
    });

    const result = await service.processBatch(
      {
        device_uuid: 'replacement-device',
        records: [
          {
            client_uuid: clientUuid,
            payload_type: SyncPayloadType.ANC_RECORD,
            payload: newerPayload,
            client_created_at: '2026-07-20T10:00:00.000Z',
          },
        ],
      },
      requester,
      requestId,
    );

    expect(result.data.results).toEqual([
      {
        client_uuid: clientUuid,
        status: 'processed',
        server_id: 'existing-anc-id',
      },
    ]);
    expect(prisma.syncQueue.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        client_uuid: clientUuid,
        client_created_at: { lt: new Date('2026-07-20T10:00:00.000Z') },
      },
      data: {
        device_uuid: 'replacement-device',
        payload: newerPayload,
        client_created_at: new Date('2026-07-20T10:00:00.000Z'),
        synced_at: null,
        status: SyncStatus.PENDING,
      },
    });
    expect(ancRecordsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ systolic: 135, client_uuid: clientUuid }),
      requester,
      { replaceExisting: true },
    );
  });

  it('isolates invalid records, marks failed, and continues the batch', async () => {
    const invalidClientUuid = '77777777-7777-4777-8777-777777777777';
    const records = [
      {
        client_uuid: invalidClientUuid,
        payload_type: SyncPayloadType.ANC_RECORD,
        payload: { systolic: 120 },
        client_created_at: '2026-07-20T09:00:00.000Z',
      },
      {
        client_uuid: clientUuid,
        payload_type: SyncPayloadType.ANC_RECORD,
        payload: ancPayload,
        client_created_at: '2026-07-20T09:30:00.000Z',
      },
    ];
    prisma.syncQueue.findUnique.mockResolvedValue(null);
    prisma.syncQueue.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          makeQueueRecord({
            ...data,
            payload_type: data.payload_type as SyncPayloadType,
            payload: data.payload as Record<string, unknown>,
            client_created_at: data.client_created_at as Date,
            status: data.status as SyncStatus,
            client_uuid: data.client_uuid as string,
          }),
        ),
    );
    ancRecordsService.create.mockResolvedValue({
      created: true,
      record: { id: 'valid-server-id' },
    });

    const result = await service.processBatch(
      { device_uuid: deviceUuid, records },
      requester,
      requestId,
    );

    expect(result.data).toMatchObject({
      total_received: 2,
      processed: 1,
      skipped: 0,
      failed: 1,
    });
    expect(result.data.results[0]).toEqual({
      client_uuid: invalidClientUuid,
      status: 'failed',
      reason: 'Payload anc_record tidak valid',
    });
    expect(result.data.results[1]).toMatchObject({
      client_uuid: clientUuid,
      status: 'processed',
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns a failed record when the shared ANC service rejects an out-of-region profile', async () => {
    const outsideProfileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const outsidePayload = {
      ...ancPayload,
      pregnancy_profile_id: outsideProfileId,
    };
    prisma.syncQueue.findUnique.mockResolvedValue(null);
    prisma.syncQueue.create.mockResolvedValue(
      makeQueueRecord({ payload: outsidePayload }),
    );
    ancRecordsService.create.mockRejectedValue(
      new ForbiddenException('Tidak memiliki akses ke catatan ANC'),
    );

    await expect(
      service.processBatch(
        {
          device_uuid: deviceUuid,
          records: [
            {
              client_uuid: clientUuid,
              payload_type: SyncPayloadType.ANC_RECORD,
              payload: outsidePayload,
              client_created_at: '2026-07-20T09:00:00.000Z',
            },
          ],
        },
        requester,
        requestId,
      ),
    ).resolves.toEqual({
      created: true,
      data: {
        total_received: 1,
        processed: 0,
        skipped: 0,
        failed: 1,
        results: [
          {
            client_uuid: clientUuid,
            status: 'failed',
            reason: 'Tidak memiliki akses ke catatan ANC',
          },
        ],
      },
    });

    expect(ancRecordsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pregnancy_profile_id: outsideProfileId,
        client_uuid: clientUuid,
      }),
      requester,
      { replaceExisting: false },
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('queues retry for an unexpected processing failure', async () => {
    prisma.syncQueue.findUnique.mockResolvedValue(null);
    prisma.syncQueue.create.mockResolvedValue(makeQueueRecord());
    ancRecordsService.create.mockRejectedValue(
      new Error('database temporarily unavailable'),
    );

    const result = await service.processBatch(
      {
        device_uuid: deviceUuid,
        records: [
          {
            client_uuid: clientUuid,
            payload_type: SyncPayloadType.ANC_RECORD,
            payload: ancPayload,
            client_created_at: '2026-07-20T09:00:00.000Z',
          },
        ],
      },
      requester,
      requestId,
    );

    expect(result.data.failed).toBe(1);
    expect(result.data.results[0]).toEqual({
      client_uuid: clientUuid,
      status: 'failed',
      reason: 'Gagal memproses record',
    });
    expect(queue.add).toHaveBeenCalledWith(
      SYNC_RETRY_JOB,
      {
        client_uuid: clientUuid,
        requester,
        request_id: requestId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        jobId: clientUuid,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  });

  it('fails reuse of client_uuid for another payload type without mutating it', async () => {
    prisma.syncQueue.findUnique.mockResolvedValue(makeQueueRecord());

    await expect(
      service.processBatch(
        {
          device_uuid: deviceUuid,
          records: [
            {
              client_uuid: clientUuid,
              payload_type: SyncPayloadType.SYMPTOM_CHECKIN,
              payload: {
                pregnancy_profile_id: profileId,
                checkin_type: CheckinType.PREGNANCY,
                answers: {},
              },
              client_created_at: '2026-07-20T10:00:00.000Z',
            },
          ],
        },
        requester,
        requestId,
      ),
    ).resolves.toEqual({
      created: false,
      data: {
        total_received: 1,
        processed: 0,
        skipped: 0,
        failed: 1,
        results: [
          {
            client_uuid: clientUuid,
            status: 'failed',
            reason:
              'client_uuid tidak boleh digunakan untuk payload_type berbeda',
          },
        ],
      },
    });
    expect(prisma.syncQueue.updateMany).not.toHaveBeenCalled();
  });

  it('returns aggregate and latest status for one device', async () => {
    prisma.syncQueue.groupBy.mockResolvedValue([
      { status: SyncStatus.PROCESSED, _count: { _all: 3 } },
      { status: SyncStatus.FAILED, _count: { _all: 1 } },
    ]);
    const latest = {
      client_uuid: clientUuid,
      payload_type: SyncPayloadType.ANC_RECORD,
      client_created_at: new Date('2026-07-20T10:00:00.000Z'),
      synced_at: new Date('2026-07-20T10:00:01.000Z'),
      status: SyncStatus.PROCESSED,
    };
    prisma.syncQueue.findFirst.mockResolvedValue(latest);

    await expect(service.getDeviceStatus(deviceUuid)).resolves.toEqual({
      device_uuid: deviceUuid,
      total: 4,
      processed: 3,
      pending: 0,
      failed: 1,
      last_sync: latest,
    });

    expect(prisma.syncQueue.findFirst).toHaveBeenCalledWith({
      where: { device_uuid: deviceUuid },
      orderBy: { client_created_at: 'desc' },
      select: {
        client_uuid: true,
        payload_type: true,
        client_created_at: true,
        synced_at: true,
        status: true,
      },
    });
  });
});
