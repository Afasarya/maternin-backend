import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { QueryEducationArticlesDto } from './dto/query-education-articles.dto.js';
import { EducationService } from './education.service.js';

@Controller('education/articles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ibu_hamil')
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  @Get()
  findAll(@Query() query: QueryEducationArticlesDto) {
    return this.educationService.findAll(query);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.educationService.findOne(slug);
  }
}
