import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard.js';
import { NutritionAnomalyCallbackDto } from './dto/nutrition-anomaly-callback.dto.js';
import { NutritionService } from './nutrition.service.js';

@Controller('internal')
export class NutritionInternalController {
  constructor(private readonly nutrition: NutritionService) {}
  @Post('nutrition-anomaly')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  anomaly(@Body() dto: NutritionAnomalyCallbackDto) {
    return this.nutrition.handleAnomaly(dto);
  }
}
