import { isoDateTimeSchema } from '../zod';

/** Default timezone for display */
export const DEFAULT_TZ = 'Asia/Jakarta';

/** Format options */
export interface DateFormatOptions {
  timeZone?: string;
  locale?: string;
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
}

/** Parse ISO string to Date */
export function parseISO(dateStr: string): Date {
  const parsed = isoDateTimeSchema.safeParse(dateStr);
  if (!parsed.success) {
    throw new Error(`Invalid ISO date: ${dateStr}`);
  }
  return new Date(dateStr);
}

/** Get current UTC date */
export function nowUTC(): Date {
  return new Date();
}

/** Get current date in Jakarta timezone */
export function nowJakarta(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }));
}

/** Format date for display (Indonesian locale) */
export function formatDate(
  date: Date | string,
  options: DateFormatOptions = {}
): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return new Intl.DateTimeFormat(options.locale ?? 'id-ID', {
    timeZone: options.timeZone ?? DEFAULT_TZ,
    dateStyle: options.dateStyle ?? 'medium',
    timeStyle: options.timeStyle ?? 'short',
  }).format(d);
}

/** Format date only (no time) */
export function formatDateOnly(date: Date | string, locale = 'id-ID'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: DEFAULT_TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

/** Format time only */
export function formatTimeOnly(date: Date | string, locale = 'id-ID'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: DEFAULT_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Format as ISO string (UTC) */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/** Start of day in Jakarta */
export function startOfDayJakarta(date: Date): Date {
  const jakartaStr = date.toLocaleString('en-US', { timeZone: DEFAULT_TZ });
  const jakartaDate = new Date(jakartaStr);
  jakartaDate.setHours(0, 0, 0, 0);
  // Convert back to UTC
  const utcStr = jakartaDate.toLocaleString('en-US', { timeZone: 'UTC' });
  return new Date(utcStr);
}

/** End of day in Jakarta */
export function endOfDayJakarta(date: Date): Date {
  const jakartaStr = date.toLocaleString('en-US', { timeZone: DEFAULT_TZ });
  const jakartaDate = new Date(jakartaStr);
  jakartaDate.setHours(23, 59, 59, 999);
  const utcStr = jakartaDate.toLocaleString('en-US', { timeZone: 'UTC' });
  return new Date(utcStr);
}

/** Add days */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Add minutes */
export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

/** Difference in minutes */
export function diffMinutes(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60000);
}

/** Difference in days */
export function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

/** Check if date is today (Jakarta) */
export function isToday(date: Date): boolean {
  const today = nowJakarta();
  const target = new Date(date.toLocaleString('en-US', { timeZone: DEFAULT_TZ }));
  return (
    target.getFullYear() === today.getFullYear() &&
    target.getMonth() === today.getMonth() &&
    target.getDate() === today.getDate()
  );
}

/** Check if date is expired (past now) */
export function isExpired(date: Date): boolean {
  return date < nowUTC();
}

/** Generate ISO string for 15 minutes from now (stock reservation) */
export function reservationExpiry(): string {
  return toISOString(addMinutes(nowUTC(), 15));
}

/** Generate ISO string for booking payment deadline */
export function bookingDeadline(minutes: number): string {
  return toISOString(addMinutes(nowUTC(), minutes));
}

/** Parse Jakarta date string to UTC Date */
export function parseJakartaDate(dateStr: string, timeStr?: string): Date {
  const [day, month, year] = dateStr.split('/').map(Number);
  const [hour = 0, minute = 0] = (timeStr ?? '00:00').split(':').map(Number);
  const jakartaDate = new Date(year, month - 1, day, hour, minute, 0);
  const utcStr = jakartaDate.toLocaleString('en-US', { timeZone: 'UTC' });
  return new Date(utcStr);
}