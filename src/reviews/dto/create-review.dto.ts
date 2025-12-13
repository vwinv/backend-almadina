import { IsInt, IsString, IsOptional, Min, Max, IsNotEmpty } from 'class-validator';

export class CreateReviewDto {
  @IsInt()
  @IsNotEmpty({ message: 'Le produit est requis' })
  productId: number;

  @IsInt()
  @Min(1, { message: 'La note doit être au moins 1' })
  @Max(5, { message: 'La note ne peut pas dépasser 5' })
  @IsNotEmpty({ message: 'La note est requise' })
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

