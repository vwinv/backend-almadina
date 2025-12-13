import {
  IsInt,
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PayDunyaPaymentMethod {
  MTN_CI = 'MTN_CI',
  MOOV_CI = 'MOOV_CI',
  ORANGE_MONEY_CI = 'ORANGE_MONEY_CI',
  WAVE_CI = 'WAVE_CI',
  WAVE_SN = 'WAVE_SN',
  ORANGE_MONEY_SN = 'ORANGE_MONEY_SN',
}

export class CreatePaymentDto {
  @IsInt()
  @Type(() => Number)
  orderId: number;

  @IsEnum(PayDunyaPaymentMethod)
  paymentMethod: PayDunyaPaymentMethod;

  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  otpCode?: string; // Pour Orange Money Burkina Faso
}

