import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { RiskBadge } from '../../common/constants/index.js';

export enum BidanConfirmAction {
  ACKNOWLEDGE = 'acknowledge',
  OVERRIDE_BADGE = 'override_badge',
  DISMISS = 'dismiss',
}

export class BidanConfirmDto {
  @IsEnum(BidanConfirmAction)
  action!: BidanConfirmAction;

  @ValidateIf(
    (dto: BidanConfirmDto) => dto.action === BidanConfirmAction.OVERRIDE_BADGE,
  )
  @IsEnum(RiskBadge)
  new_risk_badge?: RiskBadge;

  @ValidateIf(
    (dto: BidanConfirmDto) => dto.action === BidanConfirmAction.OVERRIDE_BADGE,
  )
  @IsString()
  @IsNotEmpty()
  @ValidateIf(
    (dto: BidanConfirmDto) =>
      dto.rationale !== undefined ||
      dto.action === BidanConfirmAction.OVERRIDE_BADGE,
  )
  rationale?: string;
}
