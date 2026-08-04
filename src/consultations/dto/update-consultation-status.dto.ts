import { IsEnum } from 'class-validator';
import { ConsultationStatus } from '../../common/constants/index.js';

export class UpdateConsultationStatusDto {
  @IsEnum(ConsultationStatus)
  status!: ConsultationStatus;
}
