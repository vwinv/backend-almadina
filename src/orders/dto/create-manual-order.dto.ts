import {
  IsInt,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsInt()
  @Type(() => Number)
  productId: number;

  @IsInt()
  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsObject()
  customization?: any;
}

class ShippingAddressDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsString()
  postalCode: string;

  @IsString()
  country: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  deliveryZoneId?: number;
}

export class CreateManualOrderDto {
  @IsInt()
  @Type(() => Number)
  userId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsNotEmpty({ message: 'paymentMethod is required' })
  @IsIn(['CASH', 'CARD', 'MOBILE_MONEY', 'OM', 'WAVE', 'MTN', 'MOOV', 'OTHER'], {
    message: 'paymentMethod must be one of the following values: CASH, CARD, MOBILE_MONEY, OM, WAVE, MTN, MOOV, OTHER'
  })
  paymentMethod: string;

  @IsBoolean()
  requiresDelivery: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  deliveryPersonId?: number;
}

