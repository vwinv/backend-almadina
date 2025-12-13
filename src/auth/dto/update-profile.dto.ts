import { IsString, IsOptional, MinLength, IsEmail, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  lastName?: string;

  @IsOptional()
  @ValidateIf((o) => o.email && o.email.trim().length > 0)
  @IsEmail({}, { message: 'Email invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Le numéro de téléphone doit contenir au moins 8 caractères' })
  phone?: string;

  @IsOptional()
  @IsString()
  profilePicture?: string;
}

