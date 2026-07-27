import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { QueryRemindersDto } from './dto/query-reminders.dto.js';
import { RemindersService } from './reminders.service.js';

@Controller('reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  @Roles('ibu_hamil', 'bidan', 'admin')
  findByProfile(
    @Query() query: QueryRemindersDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.remindersService.findByProfile(
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
    return this.remindersService.findOne(id, requester);
  }

  @Patch(':id/pause')
  @Roles('bidan', 'admin')
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.remindersService.pauseReminder(id, requester);
  }

  @Patch(':id/resume')
  @Roles('bidan', 'admin')
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.remindersService.resumeReminder(id, requester);
  }
}
