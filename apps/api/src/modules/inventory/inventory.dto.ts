import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const QTY_PATTERN = /^-?\d+(\.\d{1,4})?$/;

export class ListStockQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class StockAdjustmentDto {
  @IsString()
  @MaxLength(100)
  variantId!: string;

  @IsString()
  @MaxLength(100)
  locationId!: string;

  @IsString()
  @Matches(QTY_PATTERN, {
    message: 'qty harus angka desimal maksimal 4 digit dan boleh negatif',
  })
  qty!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class StockTransferDto {
  @IsString()
  @MaxLength(100)
  variantId!: string;

  @IsString()
  @MaxLength(100)
  fromLocationId!: string;

  @IsString()
  @MaxLength(100)
  toLocationId!: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'qty harus angka desimal maksimal 4 digit',
  })
  qty!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListLedgerQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 100;
}

export interface StockBalanceView {
  variantId: string;
  sku: string;
  productName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  qtyOnHand: string;
  qtyReserved: string;
  qtyAvailable: string;
}

export interface StockLedgerView {
  id: string;
  variantId: string;
  sku: string;
  locationId: string;
  locationCode: string;
  movementType: string;
  qtyDelta: string;
  qtyReservedDelta: string;
  referenceId: string | null;
  referenceType: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export interface LocationOptionView {
  id: string;
  code: string;
  name: string;
  type: string;
}
