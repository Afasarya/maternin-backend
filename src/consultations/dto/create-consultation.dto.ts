import { IsUUID } from 'class-validator';

export class CreateConsultationDto {
  @IsUUID()
  pregnancy_profile_id!: string;
}
