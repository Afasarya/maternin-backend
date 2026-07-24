import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AncRecordsService } from './anc-records.service.js';
import { CreateAncRecordDto } from './dto/create-anc-record.dto.js';
import { QueryAncRecordsDto } from './dto/query-anc-records.dto.js';
import { QueryLatestAncRecordDto } from './dto/query-latest-anc-record.dto.js';

@Controller('anc-records')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AncRecordsController {
  constructor(private readonly ancRecordsService: AncRecordsService) {}

  @Post()
  @Roles('ibu_hamil', 'bidan', 'kader')
  create(
    @Body() dto: CreateAncRecordDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.ancRecordsService.create(dto, requester);
  }

  @Get()
  @Roles('ibu_hamil', 'bidan', 'admin')
  findByProfile(
    @Query() query: QueryAncRecordsDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.ancRecordsService.findByProfile(
      query.pregnancy_profile_id,
      query,
      requester,
    );
  }

  @Get('latest')
  @Roles('ibu_hamil', 'bidan', 'admin')
  findLatest(
    @Query() query: QueryLatestAncRecordDto,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.ancRecordsService.findLatest(
      query.pregnancy_profile_id,
      requester,
    );
  }

  @Get(':id')
  @Roles('ibu_hamil', 'bidan', 'admin')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: CurrentUserData,
  ) {
    return this.ancRecordsService.findOne(id, requester);
  }
}
