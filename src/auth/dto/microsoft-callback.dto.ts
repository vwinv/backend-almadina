import { IsString, IsOptional } from 'class-validator';

export class MicrosoftCallbackDto {
  @IsString()
  accessToken: string; // Microsoft access token

  @IsString()
  userId: string; // Microsoft user ID (oid)

  @IsString()
  @IsOptional()
  email?: string; // Microsoft email (upn ou mail)

  @IsString()
  @IsOptional()
  name?: string; // Microsoft display name

  @IsString()
  @IsOptional()
  firstName?: string; // Prénom

  @IsString()
  @IsOptional()
  lastName?: string; // Nom de famille

  @IsString()
  @IsOptional()
  picture?: string; // URL de la photo de profil
}
