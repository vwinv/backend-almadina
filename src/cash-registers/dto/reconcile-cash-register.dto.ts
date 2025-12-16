import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReconcileCashRegisterDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualBalance: number; // Solde réel compté

  @IsOptional()
  @IsString()
  notes?: string; // Notes de réconciliation
}
