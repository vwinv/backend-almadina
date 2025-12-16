import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCashRegisterDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  openingBalance: number; // Solde d'ouverture de la caisse
}
