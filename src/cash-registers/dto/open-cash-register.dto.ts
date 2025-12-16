import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OpenCashRegisterDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  openingBalance?: number; // Solde d'ouverture de la caisse (optionnel, utilise celui de la caisse fermée existante)
}
