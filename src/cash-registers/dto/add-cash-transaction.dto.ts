import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CashRegisterTransactionType } from '../types/cash-register.types';

export class AddCashTransactionDto {
  @IsEnum(CashRegisterTransactionType)
  type: CashRegisterTransactionType;

  @IsNumber()
  @Type(() => Number)
  amount: number; // Montant (positif pour entrée, négatif pour sortie)

  @IsOptional()
  @IsString()
  description?: string; // Description de la transaction

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  orderId?: number; // Commande associée (si vente/retour)
}
