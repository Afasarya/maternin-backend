import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface FonnteSendResult {
  success: boolean;
}

@Injectable()
export class FonnteClient {
  private static readonly SEND_URL = 'https://api.fonnte.com/send';
  private static readonly TIMEOUT_MS = 10_000;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.apiKey = configService.getOrThrow<string>('FONNTE_API_KEY');
  }

  async sendWhatsApp(
    phoneNumber: string,
    message: string,
  ): Promise<FonnteSendResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>(
          FonnteClient.SEND_URL,
          { target: phoneNumber, message },
          {
            timeout: FonnteClient.TIMEOUT_MS,
            headers: { Authorization: this.apiKey },
          },
        ),
      );

      return { success: this.isSuccessfulResponse(response.data) };
    } catch {
      return { success: false };
    }
  }

  private isSuccessfulResponse(value: unknown) {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as Record<string, unknown>).status === true
    );
  }
}
