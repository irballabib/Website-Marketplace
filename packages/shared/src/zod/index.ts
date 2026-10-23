import { z } from 'zod';

/** UUID v7 string */
export const uuidSchema = z.string().uuid({ version: 'v7' });

/** ISO 8601 datetime string (UTC) */
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Positive integer */
export const positiveIntSchema = z.number().int().positive();

/** Non-negative integer */
export const nonNegativeIntSchema = z.number().int().nonnegative();

/** Decimal string for money (max 18 digits, 2 decimals) */
export const decimalSchema = z.string().regex(/^\d+(\.\d{1,2})?$/);

/** Email */
export const emailSchema = z.string().email();

/** Indonesian phone number */
export const phoneIdSchema = z.string().regex(/^(\+62|62|0)8[1-9][0-9]{7,9}$/);

/** Pagination cursor */
export const cursorSchema = z.string().optional();

/** Pagination limit */
export const limitSchema = z.number().int().min(1).max(100).default(20);

/** Sort order */
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** Money input (string to avoid float issues) */
export const moneyInputSchema = z.string().regex(/^\d+(\.\d{1,2})?$/);

/** Tenant ID (UUID v7) */
export const tenantIdSchema = uuidSchema;

/** User ID (UUID v7) */
export const userIdSchema = uuidSchema;

/** SKU code */
export const skuSchema = z.string().min(3).max(50).regex(/^[A-Z0-9\-]+$/);

/** Barcode (EAN-13 or Code128) */
export const barcodeSchema = z.string().regex(/^[0-9]{13}$|^[A-Z0-9\-]{10,50}$/);

/** Color name */
export const colorSchema = z.string().min(1).max(30);

/** Size name */
export const sizeSchema = z.string().min(1).max(20);

/** Indonesian postal code */
export const postalCodeSchema = z.string().regex(/^[0-9]{5}$/);

/** URL slug */
export const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9\-]+$/);