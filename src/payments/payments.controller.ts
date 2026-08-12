import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client.js';
import {
  ConsultationStatus,
  PaymentStatus,
} from '../common/constants/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
@Controller('internal/xendit-webhook')
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  @Post()
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers('x-callback-token') token: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    if (
      !token ||
      token !== this.config.getOrThrow<string>('XENDIT_WEBHOOK_TOKEN')
    )
      throw new UnauthorizedException('Token webhook tidak valid');
    const invoiceId = typeof payload.id === 'string' ? payload.id : '';
    const externalId =
      typeof payload.external_id === 'string' ? payload.external_id : '';
    const rawStatus =
      typeof payload.status === 'string' ? payload.status.toUpperCase() : '';
    const paymentStatus: PaymentStatus =
      rawStatus === 'PAID' || rawStatus === 'SETTLED'
        ? PaymentStatus.PAID
        : rawStatus === 'EXPIRED'
          ? PaymentStatus.EXPIRED
          : rawStatus === 'FAILED'
            ? PaymentStatus.FAILED
            : PaymentStatus.PENDING;
    const consultationStatus =
      paymentStatus === PaymentStatus.PAID
        ? ConsultationStatus.SCHEDULED
        : paymentStatus === PaymentStatus.EXPIRED
          ? ConsultationStatus.EXPIRED
          : undefined;
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: invoiceId
          ? { xendit_invoice_id: invoiceId }
          : { consultation_id: externalId },
        data: {
          status: paymentStatus,
          paid_at:
            paymentStatus === PaymentStatus.PAID ? new Date() : undefined,
          xendit_payload: payload as Prisma.InputJsonValue,
        },
      });
      if (consultationStatus)
        await tx.consultation.update({
          where: { id: payment.consultation_id },
          data: { status: consultationStatus },
        });
      return { received: true, status: paymentStatus };
    });
  }
}
