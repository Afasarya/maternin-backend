import {
  Allow,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class FonnteInboundDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sender!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  // Metadata resmi webhook Fonnte. Diizinkan melewati whitelist, tetapi tidak
  // dipakai sebagai identitas pasien atau data klinis.
  @Allow() choices?: unknown;
  @Allow() device?: unknown;
  @Allow() extension?: unknown;
  @Allow() filename?: unknown;
  @IsOptional()
  @IsInt()
  inboxid?: number;
  @Allow() isforwarded?: unknown;
  @Allow() isgroup?: unknown;
  @Allow() location?: unknown;
  @Allow() memberlid?: unknown;
  @Allow() mode?: unknown;
  @Allow() name?: unknown;
  @Allow() pengirim?: unknown;
  @Allow() pesan?: unknown;
  @Allow() pollname?: unknown;
  @Allow() pushname?: unknown;
  @Allow() quick?: unknown;
  @Allow() senderlid?: unknown;
  @Allow() text?: unknown;
  @Allow() timestamp?: unknown;
  @Allow() type?: unknown;
  @Allow() url?: unknown;
  @Allow() username?: unknown;
}
