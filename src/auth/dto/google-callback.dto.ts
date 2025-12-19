import { IsString } from 'class-validator';

export class GoogleCallbackDto {
  @IsString()
  credential: string; // Google ID token
}
