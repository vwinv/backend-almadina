import { IsArray, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignProductsDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  productIds?: number[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  categoryId?: number;
}

