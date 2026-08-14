import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';
import { RegisterDto } from './register.dto.js';

describe('auth phone validation', () => {
  it.each([
    ['081234567890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['+6281234567890', '+6281234567890'],
    ['08 1234-567-890', '+6281234567890'],
  ])('menerima dan menormalkan nomor %s', async (phoneNumber, expected) => {
    const dto = plainToInstance(LoginDto, {
      phone_number: phoneNumber,
      password: 'password123',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.phone_number).toBe(expected);
  });

  it.each(['+62123456789', '12345', 'telepon'])(
    'menolak nomor %s',
    async (phoneNumber) => {
      const dto = plainToInstance(LoginDto, {
        phone_number: phoneNumber,
        password: 'password123',
      });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it('register tidak memiliki input role atau puskesmas', () => {
    const dto = new RegisterDto();

    expect('role' in dto).toBe(false);
    expect('puskesmas_id' in dto).toBe(false);
  });
});
