import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreatePregnancyProfileDto } from './create-pregnancy-profile.dto.js';

export class UpdatePregnancyProfileDto extends PartialType(
  OmitType(CreatePregnancyProfileDto, ['user_id'] as const),
) {}
