import { clsx, type ClassValue } from 'clsx';

/** Merge class names */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Generate UUID v7 (timestamp-based) */
export function generateUuidV7(): string {
  const now = Date.now();
  const timestampHex = now.toString(16).padStart(12, '0');
  const randomHex = crypto.getRandomValues(new Uint8Array(10))
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  return [
    timestampHex.slice(0, 8),
    timestampHex.slice(8, 12),
    '7' + randomHex.slice(0, 3),
    '8' + randomHex.slice(3, 7),
    randomHex.slice(7, 20),
  ].join('-');
}

/** Sleep utility */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Retry with exponential backoff */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelay?: number; maxDelay?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 10000 } = options;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxAttempts) break;
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/** Format number as Indonesian Rupiah */
export function formatRupiah(amount: string | number, options: { symbol?: boolean; compact?: boolean } = {}): string {
  const { symbol = true, compact = false } = options;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return symbol ? 'Rp 0' : '0';

  if (compact) {
    if (num >= 1_000_000_000) return `${symbol ? 'Rp ' : ''}${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${symbol ? 'Rp ' : ''}${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${symbol ? 'Rp ' : ''}${(num / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat('id-ID', {
    style: symbol ? 'currency' : 'decimal',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/** Parse Indonesian Rupiah string to number */
export function parseRupiah(str: string): number {
  return parseFloat(str.replace(/[Rp\s.,]/g, '').replace(',', '.')) || 0;
}

/** Deep clone */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Omit keys from object */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
}

/** Pick keys from object */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => { if (key in obj) result[key] = obj[key]; });
  return result;
}

/** Check if object is empty */
export function isEmpty(obj: unknown): boolean {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}