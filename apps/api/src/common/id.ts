import { randomBytes } from 'node:crypto';

/**
 * Generate a UUID v7 (RFC 9562): 48-bit Unix timestamp in ms + random bits.
 * Time-ordered IDs keep B-tree indexes compact compared to UUID v4.
 */
export function generateUuidV7(now: number = Date.now()): string {
  const timestamp = now.toString(16).padStart(12, '0');
  const random = randomBytes(10).toString('hex');

  return [
    timestamp.slice(0, 8),
    timestamp.slice(8, 12),
    `7${random.slice(0, 3)}`,
    `8${random.slice(3, 6)}`,
    random.slice(6, 18),
  ].join('-');
}
