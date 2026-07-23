import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePuskesmasDto } from './dto/create-puskesmas.dto.js';
import { QueryNearbyDto } from './dto/query-nearby.dto.js';
import { QueryPuskesmasDto } from './dto/query-puskesmas.dto.js';
import { UpdatePuskesmasDto } from './dto/update-puskesmas.dto.js';
import { FacilitiesCacheService } from './facilities-cache.service.js';

export interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  [key: string]: unknown;
}

export type NearbyFacility = NominatimResult & { distance_m: number };

@Injectable()
export class FacilitiesService {
  private static readonly NEARBY_CACHE_TTL_SECONDS = 24 * 60 * 60;
  private readonly nominatimBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly cache: FacilitiesCacheService,
    configService: ConfigService,
  ) {
    this.nominatimBaseUrl =
      configService.getOrThrow<string>('NOMINATIM_BASE_URL');
  }

  create(dto: CreatePuskesmasDto) {
    return this.prisma.puskesmas.create({ data: dto });
  }

  async findAll(pagination: QueryPuskesmasDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.puskesmas.findMany({
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.puskesmas.count(),
    ]);

    return { data, total };
  }

  async findOne(id: string) {
    const puskesmas = await this.prisma.puskesmas.findUnique({
      where: { id },
    });

    if (!puskesmas) {
      throw new NotFoundException('Puskesmas tidak ditemukan');
    }

    return puskesmas;
  }

  async update(id: string, dto: UpdatePuskesmasDto) {
    await this.findOne(id);

    return this.prisma.puskesmas.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.puskesmas.delete({ where: { id } });
  }

  async findNearby(query: QueryNearbyDto): Promise<NearbyFacility[]> {
    const cacheKey = this.buildNearbyCacheKey(query);
    const cached = await this.cache.get<NearbyFacility[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const viewbox = this.buildViewbox(query.lat, query.lng, query.radius);

    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(`${this.nominatimBaseUrl}/search`, {
          timeout: 5000,
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'id',
            'User-Agent': 'MaternIn/1.0 (facilities-nearby-proxy)',
          },
          params: {
            q: 'puskesmas OR rumah sakit',
            format: 'jsonv2',
            lat: query.lat,
            lon: query.lng,
            bounded: 1,
            viewbox,
            addressdetails: 1,
            limit: 50,
          },
        }),
      );

      if (!Array.isArray(response.data)) {
        throw new BadGatewayException('Respons Nominatim tidak valid');
      }

      const facilities = (response.data as NominatimResult[])
        .map((facility) => ({
          ...facility,
          distance_m: Math.round(
            this.calculateDistance(
              query.lat,
              query.lng,
              Number(facility.lat),
              Number(facility.lon),
            ),
          ),
        }))
        .filter(
          (facility) =>
            Number.isFinite(facility.distance_m) &&
            facility.distance_m <= query.radius,
        )
        .sort((a, b) => a.distance_m - b.distance_m);

      await this.cache.set(
        cacheKey,
        facilities,
        FacilitiesService.NEARBY_CACHE_TTL_SECONDS,
      );

      return facilities;
    } catch (error: unknown) {
      if (
        error instanceof GatewayTimeoutException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }

      if (error instanceof AxiosError && error.code === 'ECONNABORTED') {
        throw new GatewayTimeoutException('Nominatim melewati batas waktu');
      }

      throw new BadGatewayException('Nominatim tidak dapat diakses');
    }
  }

  private buildNearbyCacheKey(query: QueryNearbyDto) {
    return [
      'facilities:nearby',
      query.lat.toFixed(5),
      query.lng.toFixed(5),
      Math.round(query.radius),
    ].join(':');
  }

  private buildViewbox(lat: number, lng: number, radius: number) {
    const latDelta = radius / 111_320;
    const longitudeScale = Math.max(
      Math.abs(Math.cos((lat * Math.PI) / 180)),
      0.01,
    );
    const lngDelta = radius / (111_320 * longitudeScale);

    return [
      lng - lngDelta,
      lat + latDelta,
      lng + lngDelta,
      lat - latDelta,
    ].join(',');
  }

  private calculateDistance(
    originLat: number,
    originLng: number,
    destinationLat: number,
    destinationLng: number,
  ) {
    const earthRadius = 6_371_000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const latDelta = toRadians(destinationLat - originLat);
    const lngDelta = toRadians(destinationLng - originLng);
    const a =
      Math.sin(latDelta / 2) ** 2 +
      Math.cos(toRadians(originLat)) *
        Math.cos(toRadians(destinationLat)) *
        Math.sin(lngDelta / 2) ** 2;

    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
