import { IsString, IsOptional } from 'class-validator';

export class FacebookCallbackDto {
  @IsString()
  accessToken: string; // Facebook access token

  @IsString()
  userId: string; // Facebook user ID

  @IsString()
  @IsOptional()
  email?: string; // Facebook email (peut être absent si l'utilisateur ne l'a pas partagé)

  @IsString()
  @IsOptional()
  name?: string; // Facebook name

  @IsString()
  @IsOptional()
  picture?: string; // URL de la photo de profil Facebook
}
