import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CloseCashRegisterDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualBalance?: number; // Solde réel compté à la fermeture (optionnel, utilise le solde attendu par défaut)
}
