import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { FonnteClient } from './fonnte.client.js';

describe('FonnteClient', () => {
  const httpService = { post: jest.fn() };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
  };
  let client: FonnteClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new FonnteClient(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('sends the exact Fonnte request with a ten-second timeout', async () => {
    httpService.post.mockReturnValue(of({ data: { status: true } }));

    await expect(
      client.sendWhatsApp('+6281410000001', 'Pesan pengingat'),
    ).resolves.toEqual({ success: true });
    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.fonnte.com/send',
      { target: '+6281410000001', message: 'Pesan pengingat' },
      {
        timeout: 10_000,
        headers: { Authorization: 'test-api-key' },
      },
    );
  });

  it('treats HTTP success with a failed provider payload as failure', async () => {
    httpService.post.mockReturnValue(
      of({ data: { status: false, reason: 'invalid target' } }),
    );

    await expect(client.sendWhatsApp('invalid', 'Pesan')).resolves.toEqual({
      success: false,
    });
  });

  it('contains transport failures without exposing provider details', async () => {
    httpService.post.mockReturnValue(
      throwError(() => new Error('provider transport failure')),
    );

    await expect(
      client.sendWhatsApp('+6281410000001', 'Pesan'),
    ).resolves.toEqual({ success: false });
  });
});
