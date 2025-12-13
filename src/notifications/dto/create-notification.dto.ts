import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number; // null = notification globale

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsString()
  link?: string;
}

