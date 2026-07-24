import { IsUUID } from 'class-validator';

export class QueryLatestAncRecordDto {
  @IsUUID()
  pregnancy_profile_id!: string;
}
