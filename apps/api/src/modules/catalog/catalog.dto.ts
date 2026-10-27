import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;
const WEIGHT_PATTERN = /^\d{1,7}(\.\d{1,3})?$/;
const SKU_PATTERN = /^[A-Z0-9-]+$/;
const BARCODE_PATTERN = /^(?:\d{13}|[A-Z0-9-]{10,50})$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/;

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function lower(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function upper(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateProductDto {
  @IsString()
  @Matches(UUID_V7_PATTERN, { message: 'categoryId harus UUID v7' })
  categoryId!: string;

  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => lower(value))
  @IsString()
  @MaxLength(100)
  @Matches(SLUG_PATTERN, { message: 'slug hanya boleh huruf kecil, angka, dan tanda hubung' })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @Transform(({ value }) => upper(value))
  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/, { message: 'skuPrefix harus 2-10 huruf/angka' })
  skuPrefix!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class CreateVariantDto {
  @Transform(({ value }) => upper(value))
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(SKU_PATTERN, { message: 'SKU hanya boleh huruf besar, angka, dan tanda hubung' })
  sku!: string;

  @IsOptional()
  @Transform(({ value }) => upper(value))
  @IsString()
  @Matches(BARCODE_PATTERN, { message: 'barcode harus EAN-13 atau Code128 10-50 karakter' })
  barcode?: string | null;

  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  color!: string;

  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  size!: string;

  @IsString()
  @Matches(MONEY_PATTERN, { message: 'price harus angka desimal maksimal 2 digit' })
  price!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'costPrice harus angka desimal maksimal 2 digit' })
  costPrice?: string | null;

  @IsOptional()
  @IsString()
  @Matches(WEIGHT_PATTERN, { message: 'weight harus angka desimal maksimal 3 digit' })
  weight?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @Matches(UUID_V7_PATTERN, { message: 'cursor harus UUID v7' })
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
