import { Type, Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const FULFILLMENT_TYPES = ['SHIP', 'PICKUP'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

function trimUnknown(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateOrderItemDto {
  // IDs are opaque strings; legacy seed rows are not strict RFC UUIDs.
  @IsString()
  @MinLength(1)
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => trimUnknown(value))
  customerName!: string;

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'customerPhone harus berupa nomor telepon 8-15 digit',
  })
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => trimUnknown(value))
  customerEmail?: string;

  @IsIn(FULFILLMENT_TYPES)
  fulfillmentType!: FulfillmentType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimUnknown(value))
  shippingAddress?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimUnknown(value))
  qrCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'shippingCost harus berupa angka dengan maksimal 2 desimal',
  })
  shippingCost?: string;
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;
}

export class UpdateShipmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => trimUnknown(value))
  courier!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(100)
  @Transform(({ value }) => trimUnknown(value))
  trackingNumber!: string;
}

export class ListAdminOrdersQueryDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;
}

export interface OrderItemView {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: string;
  total: string;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  locationId: string;
  qrCode: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  fulfillmentType: string;
  shippingAddress: string | null;
  subtotal: string;
  discount: string;
  shippingCost: string;
  total: string;
  currency: string;
  expiresAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  courier: string | null;
  trackingNumber: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: OrderItemView[];
}
