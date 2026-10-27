import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
  size: number;
}

function trimUnknown(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const IMAGE_TYPES: Record<
  string,
  { extension: string; matches: (buffer: Buffer) => boolean }
> = {
  'image/jpeg': {
    extension: 'jpg',
    matches: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    extension: 'png',
    matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE),
  },
  'image/webp': {
    extension: 'webp',
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP',
  },
  'image/avif': {
    extension: 'avif',
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString('ascii', 4, 8) === 'ftyp' &&
      ['avif', 'avis'].includes(buffer.toString('ascii', 8, 12)),
  },
};

/**
 * Validates both the declared MIME type and the file signature. The generated
 * filename never uses the client-supplied name or extension.
 */
export function validateImageUpload(file: UploadedImage | undefined): ValidatedImage {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestException({
      code: 'CATALOG_FILE_REQUIRED',
      message: 'File gambar wajib diunggah',
    });
  }

  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw new BadRequestException({
      code: 'CATALOG_FILE_TOO_LARGE',
      message: 'Ukuran gambar maksimal 5 MB',
    });
  }

  const contentType = file.mimetype.toLowerCase();
  const imageType = IMAGE_TYPES[contentType];

  if (!imageType) {
    throw new BadRequestException({
      code: 'CATALOG_INVALID_MEDIA_TYPE',
      message: 'Format gambar harus JPEG, PNG, WebP, atau AVIF',
    });
  }

  if (!imageType.matches(file.buffer)) {
    throw new BadRequestException({
      code: 'CATALOG_INVALID_MEDIA_CONTENT',
      message: 'Isi file tidak sesuai dengan tipe gambar',
    });
  }

  return {
    buffer: file.buffer,
    contentType,
    extension: imageType.extension,
    size: file.buffer.length,
  };
}

export class UploadMediaDto {
  @IsOptional()
  @Transform(({ value }) => trimUnknown(value))
  @IsString()
  @MaxLength(200)
  alt?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    return value === true || value === 1 || value === 'true' || value === '1';
  })
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}
