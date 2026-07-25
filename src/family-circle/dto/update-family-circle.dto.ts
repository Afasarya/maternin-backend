import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateFamilyCircleDto } from './create-family-circle.dto.js';

export class UpdateFamilyCircleDto extends PartialType(
  OmitType(CreateFamilyCircleDto, ['pregnancy_profile_id'] as const),
) {}
