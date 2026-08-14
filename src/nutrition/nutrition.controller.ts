import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ParseNutritionDto } from './dto/parse-nutrition.dto.js';
import { QueryNutritionLogsDto } from './dto/query-nutrition-logs.dto.js';
import { NutritionService } from './nutrition.service.js';

@Controller('nutrition')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
export class NutritionController {
  constructor(private readonly nutrition: NutritionService) {}

  @Post('parse')
  @Roles('ibu_hamil', 'bidan', 'admin')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  parse(
    @Body() dto: ParseNutritionDto,
    @CurrentUser() requester: CurrentUserData,
    @Headers('x-request-id') requestId: string,
  ) {
    return this.nutrition.parse(dto, requester, requestId);
  }
}

@Controller('nutrition-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NutritionLogsController {
  constructor(private readonly nutrition: NutritionService) {}
  @Get()
  @Roles('ibu_hamil', 'bidan')
  getLogs(
    @Query() query: QueryNutritionLogsDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.nutrition.getLogs(query, requester);
  }
}
