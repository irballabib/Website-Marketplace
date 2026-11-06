import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsDateString,
  MinLength,
  Max,
  Min,
} from 'class-validator';

export enum BookingType {
  PREORDER_BATCH = 'PREORDER_BATCH',
  CUSTOM_SIZE = 'CUSTOM_SIZE',
  FITTING_SLOT = 'FITTING_SLOT',
}

export enum BookingStatus {
  DRAFT = 'DRAFT',
  WAITING_DP = 'WAITING_DP',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY_FOR_SETTLEMENT = 'READY_FOR_SETTLEMENT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

export enum RefundRule {
  FULL_UNTIL_H3 = 'FULL_UNTIL_H3',
  HALF_UNTIL_H1 = 'HALF_UNTIL_H1',
  CUSTOM = 'CUSTOM',
}

export enum QuotaType {
  BATCH = 'BATCH',
  SLOT_PER_JAM = 'SLOT_PER_JAM',
}

export class CreateBookingDto {
  @ApiProperty({ enum: Object.values(BookingType), example: 'PREORDER_BATCH' })
  @IsIn(Object.values(BookingType))
  type!: BookingType;

  @ApiProperty({ example: 'Cutbray Classic Preorder' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: Object.values(BookingStatus), example: 'DRAFT', required: false })
  @IsOptional()
  @IsIn(Object.values(BookingStatus))
  status?: BookingStatus;

  @ApiProperty({ example: 150000, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  dpAmount?: number;

  @ApiProperty({ example: '2026-12-31T23:59:59.000Z', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ example: '2027-01-31T23:59:59.000Z', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ example: 30, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  quotaValue?: number;

  @ApiProperty({ enum: Object.values(RefundRule), example: 'FULL_UNTIL_H3', required: false })
  @IsOptional()
  @IsIn(Object.values(RefundRule))
  refundRule?: RefundRule;

  @ApiProperty({ enum: Object.values(QuotaType), example: 'BATCH', required: false })
  @IsOptional()
  @IsIn(Object.values(QuotaType))
  quotaType?: QuotaType;

  @ApiProperty({ example: 1440, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  payDeadlineMinutes?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  dpCreditable?: boolean;

  @ApiProperty({ example: 'CB-CLASSIC-30', required: false })
  @IsOptional()
  @IsString()
  productSku?: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  customerName!: string;

  @ApiProperty({ example: '+6281234567890', required: false })
  @IsOptional()
  @IsPhoneNumber('ID')
  customerPhone?: string;

  @ApiProperty({ example: 'john@example.com', required: false })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: Object.values(BookingStatus), example: 'WAITING_DP' })
  @IsIn(Object.values(BookingStatus))
  status!: BookingStatus;
}

// DTO for updating booking policy
export class UpdateBookingPolicyDto {
  @ApiProperty({ enum: Object.values(RefundRule), example: 'FULL_UNTIL_H3', description: 'Optional' })
  @IsOptional()
  @IsIn(Object.values(RefundRule))
  refundRule?: RefundRule;

  @ApiProperty({ example: 1440, description: 'DP deadline in minutes' })
  @IsOptional()
  @IsInt()
  @Min(1)
  payDeadlineMinutes?: number;

  @ApiProperty({ example: true, description: 'Whether DP is creditable' })
  @IsOptional()
  @IsBoolean()
  dpCreditable?: boolean;

  @ApiProperty({ example: 30, description: 'Default DP percent' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultDpPercent?: number;
}

// DTO for booking response
export class BookingView {
  @ApiProperty({ example: 'bk-12345678' })
  id!: string;

  @ApiProperty({ enum: Object.values(BookingType), example: 'PREORDER_BATCH' })
  type!: BookingType;

  @ApiProperty({ example: 'Cutbray Classic Preorder' })
  name!: string;

  @ApiProperty({ enum: Object.values(BookingStatus), example: 'WAITING_DP' })
  status!: BookingStatus;

  @ApiProperty({ example: 150000 })
  dpAmount!: number;

  @ApiProperty({ example: true })
  dpPaid!: boolean;

  @ApiProperty({ example: '2026-12-31T23:59:59.000Z' })
  startDate?: string | null;

  @ApiProperty({ example: '2027-01-31T23:59:59.000Z' })
  endDate?: string | null;

  @ApiProperty({ example: 30 })
  dpPercent?: number;

  @ApiProperty({ example: 'john@example.com' })
  customerEmail?: string | null;
}

// DTO for policy list response
export class BookingPolicyView {
  @ApiProperty({ example: 'p-12345678' })
  id!: string;

  @ApiProperty({ enum: Object.values(BookingType), example: 'PREORDER_BATCH' })
  bookingType!: BookingType;

  @ApiProperty({ example: 30 })
  dpPercent!: number;

  @ApiProperty({ example: 1440 })
  payDeadlineMinutes!: number;

  @ApiProperty({ enum: Object.values(RefundRule), example: 'FULL_UNTIL_H3' })
  refundRule!: RefundRule;

  @ApiProperty({ example: 'BATCH' })
  quotaType!: QuotaType;

  @ApiProperty({ example: 100 })
  quotaValue!: number;

  @ApiProperty({ example: true })
  dpCreditable!: boolean;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  startDate?: string;

  @ApiProperty({ example: '2027-12-31T23:59:59.000Z' })
  endDate?: string;
}

// Partial update DTO
export class UpdateBookingDto extends PartialType(CreateBookingDto) {}