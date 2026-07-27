import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { QueryNotificationsDto } from './dto/query-notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles('ibu_hamil', 'bidan', 'admin')
  findByProfile(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.notificationsService.getNotificationHistory(
      query.pregnancy_profile_id,
      query,
      requester,
    );
  }

  @Get(':id')
  @Roles('ibu_hamil', 'bidan', 'admin')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.notificationsService.findOne(id, requester);
  }
}
