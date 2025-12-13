import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  emailOrPhone: string; // Peut être un email ou un numéro de téléphone

  @IsString()
  @MinLength(6, { message: 'Le mot de passe doit contenir au moins 6 caractères' })
  password: string;
}

