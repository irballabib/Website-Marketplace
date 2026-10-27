import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export class JournalLineDto {
  @IsString()
  @MinLength(1)
  accountId!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'debit harus angka desimal maksimal 2 digit' })
  debit?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'credit harus angka desimal maksimal 2 digit' })
  credit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class CreateJournalDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class ReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export interface JournalLineView {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  description: string | null;
}

export interface JournalView {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  status: string;
  totalDebit: string;
  totalCredit: string;
  lines: JournalLineView[];
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: string;
  credit: string;
  balance: string;
}

export interface TrialBalanceView {
  from: string;
  to: string;
  rows: TrialBalanceRow[];
  totalDebit: string;
  totalCredit: string;
}

export interface IncomeStatementView {
  from: string;
  to: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  expenses: string;
  netIncome: string;
  rows: TrialBalanceRow[];
}

export interface BalanceSheetView {
  asOf: string;
  assets: string;
  liabilities: string;
  equity: string;
  netIncome: string;
  totalLiabilitiesEquity: string;
  balanced: boolean;
  rows: TrialBalanceRow[];
}
