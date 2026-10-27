import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

function trimUnknown(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateQrLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => trimUnknown(value))
  locationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimUnknown(value))
  productSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimUnknown(value))
  targetUrl?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export interface QrLinkView {
  code: string;
  targetUrl: string;
  shortUrl: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}
