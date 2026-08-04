import { IsString } from 'class-validator';

export class SyncStatusQueryDto {
  @IsString()
  device_uuid!: string;
}
