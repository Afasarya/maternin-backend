import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
import { ChatService } from './chat.service.js';
import { QueryChatHistoryDto } from './dto/query-chat-history.dto.js';
import { SendChatDto } from './dto/send-chat.dto.js';

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @Roles('ibu_hamil')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  sendMessage(
    @Body() dto: SendChatDto,
    @CurrentUser() requester: CurrentUserData,
    @Headers('x-request-id') requestId: string,
  ) {
    return this.chatService.sendMessage(dto, requester, requestId);
  }

  @Get('history')
  @Roles('ibu_hamil', 'bidan', 'admin')
  getHistory(
    @Query() query: QueryChatHistoryDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.chatService.getHistory(
      query.pregnancy_profile_id,
      query,
      requester,
    );
  }

  @Get('history/:id')
  @Roles('ibu_hamil', 'bidan', 'admin')
  getMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.chatService.getMessage(id, requester);
  }
}
