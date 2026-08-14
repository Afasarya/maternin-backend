import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { FonnteInboundDto } from './dto/fonnte-inbound.dto.js';
import { FonnteWebhookAuthGuard } from './guards/fonnte-webhook-auth.guard.js';
import { NutritionService } from './nutrition.service.js';

@Controller('webhooks')
export class FonnteWebhookController {
  constructor(private readonly nutrition: NutritionService) {}
  @Post('fonnte-inbound')
  @UseGuards(FonnteWebhookAuthGuard)
  inbound(
    @Body() dto: FonnteInboundDto,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.nutrition.handleInbound(dto, requestId);
  }
}
