import { IsString, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { DeliveryPersonStatus } from '@prisma/client';

export class CreateDeliveryPersonDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(DeliveryPersonStatus)
  status?: DeliveryPersonStatus;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  licensePlate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

