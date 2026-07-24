import { IsEnum, IsIn, IsOptional } from 'class-validator';
import {
  PregnancyOutcome,
  PregnancyStatus,
} from '../../common/constants/index.js';

const allowedStatuses = [
  PregnancyStatus.NIFAS,
  PregnancyStatus.SELESAI,
] as const;

export class UpdateStatusDto {
  @IsEnum(PregnancyStatus)
  @IsIn(allowedStatuses, {
    message: 'status hanya boleh nifas atau selesai',
  })
  status!: PregnancyStatus;

  @IsOptional()
  @IsEnum(PregnancyOutcome)
  pregnancy_outcome?: PregnancyOutcome;
}
