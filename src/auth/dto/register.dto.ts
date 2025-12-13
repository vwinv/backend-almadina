import { IsEmail, IsString, MinLength, IsOptional, ValidateIf } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @ValidateIf((o) => o.email && o.email.trim().length > 0)
  @IsEmail({}, { message: 'Email invalide' })
  email?: string;

  @IsString()
  @MinLength(8, { message: 'Le numéro de téléphone doit contenir au moins 8 caractères' })
  phone: string;

  @IsString()
  @MinLength(6, { message: 'Le mot de passe doit contenir au moins 6 caractères' })
  password: string;

  @IsString()
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères' })
  firstName: string;

  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  lastName: string;
}

