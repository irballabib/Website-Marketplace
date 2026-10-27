import { Type, Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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

export const POS_PAYMENT_METHODS = ['CASH', 'QRIS', 'TRANSFER', 'EDC'] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

function trimUnknown(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class OpenShiftDto {
  @IsString()
  @MinLength(1)
  locationId!: string;

  @IsString()
  @Matches(MONEY_PATTERN, { message: 'openingCash harus angka desimal maksimal 2 digit' })
  openingCash!: string;
}

export class CloseShiftDto {
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'closingCash harus angka desimal maksimal 2 digit' })
  closingCash!: string;
}

export class PosSaleItemDto {
  @IsString()
  @MinLength(1)
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(999)
  qty!: number;
}

export class PosPaymentDto {
  @IsIn(POS_PAYMENT_METHODS)
  method!: PosPaymentMethod;

  @IsString()
  @Matches(MONEY_PATTERN, { message: 'amount harus angka desimal maksimal 2 digit' })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimUnknown(value))
  reference?: string;
}

export class CreatePosSaleDto {
  @IsString()
  @MinLength(1)
  shiftId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items!: PosSaleItemDto[];

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'discount harus angka desimal maksimal 2 digit' })
  discount?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosPaymentDto)
  payments!: PosPaymentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimUnknown(value))
  customerName?: string;
}

export class VoidSaleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  @Transform(({ value }) => trimUnknown(value))
  reason!: string;
}

export class ListPosSalesQueryDto {
  @IsOptional()
  @IsString()
  shiftId?: string;
}

export interface PosShiftView {
  id: string;
  locationId: string;
  cashierId: string;
  status: string;
  openingCash: string;
  closingCash: string | null;
  expectedCash: string | null;
  difference: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface PosSaleItemView {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: string;
  total: string;
}

export interface PosPaymentView {
  id: string;
  method: string;
  amount: string;
  reference: string | null;
}

export interface PosSaleView {
  id: string;
  receiptNumber: string;
  shiftId: string;
  locationId: string;
  cashierId: string;
  status: string;
  customerName: string | null;
  subtotal: string;
  discount: string;
  total: string;
  paymentTotal: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  items: PosSaleItemView[];
  payments: PosPaymentView[];
}

export interface PosLocationView {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface PosCatalogItemView {
  variantId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  price: string;
  stockAvailable: string;
}
