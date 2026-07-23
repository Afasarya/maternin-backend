import { HttpService } from '@nestjs/axios';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { FacilitiesCacheService } from './facilities-cache.service.js';
import { FacilitiesService } from './facilities.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

describe('FacilitiesService', () => {
  const prisma = {
    puskesmas: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const httpService = { get: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('https://nominatim.example'),
  };
  const service = new FacilitiesService(
    prisma as unknown as PrismaService,
    httpService as unknown as HttpService,
    cache as unknown as FacilitiesCacheService,
    configService as unknown as ConfigService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns paginated puskesmas data', async () => {
    prisma.puskesmas.findMany.mockReturnValue(Promise.resolve([]));
    prisma.puskesmas.count.mockReturnValue(Promise.resolve(2));
    prisma.$transaction.mockResolvedValue([[], 2]);

    await expect(service.findAll({ limit: 20, offset: 0 })).resolves.toEqual({
      data: [],
      total: 2,
    });
    expect(prisma.puskesmas.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 20,
      orderBy: { name: 'asc' },
    });
  });

  it('throws when a puskesmas does not exist', async () => {
    prisma.puskesmas.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a nearby result from Redis without calling Nominatim', async () => {
    const cached = [
      {
        place_id: 1,
        lat: '-6.9',
        lon: '110.4',
        display_name: 'Puskesmas Cached',
        distance_m: 10,
      },
    ];
    cache.get.mockResolvedValue(cached);

    await expect(
      service.findNearby({ lat: -6.9, lng: 110.4, radius: 5000 }),
    ).resolves.toEqual(cached);
    expect(httpService.get).not.toHaveBeenCalled();
  });

  it('filters, sorts, and caches a Nominatim response for 24 hours', async () => {
    cache.get.mockResolvedValue(null);
    httpService.get.mockReturnValue(
      of({
        data: [
          {
            place_id: 2,
            lat: '0.02',
            lon: '0',
            display_name: 'Puskesmas Dua',
          },
          {
            place_id: 1,
            lat: '0.01',
            lon: '0',
            display_name: 'Puskesmas Satu',
          },
          {
            place_id: 3,
            lat: '0.1',
            lon: '0',
            display_name: 'Rumah Sakit Jauh',
          },
        ],
      }),
    );

    const result = await service.findNearby({ lat: 0, lng: 0, radius: 5000 });

    expect(result.map((facility) => facility.place_id)).toEqual([1, 2]);
    expect(cache.set).toHaveBeenCalledWith(
      'facilities:nearby:0.00000:0.00000:5000',
      result,
      86400,
    );
    expect(httpService.get).toHaveBeenCalledWith(
      'https://nominatim.example/search',
      expect.objectContaining({ timeout: 5000 }),
    );
  });
});
