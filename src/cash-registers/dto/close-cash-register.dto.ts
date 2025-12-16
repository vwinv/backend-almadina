import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CloseCashRegisterDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualBalance: number; // Solde réel compté à la fermeture

  @IsOptional()
  closingBalance?: number; // Solde de fermeture (peut être différent si ajustements)
}
