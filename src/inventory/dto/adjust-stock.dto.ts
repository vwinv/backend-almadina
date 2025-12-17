import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum StockAdjustmentType {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
  SET = 'SET',
}

export class AdjustStockDto {
  @IsEnum(StockAdjustmentType)
  type: StockAdjustmentType;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
