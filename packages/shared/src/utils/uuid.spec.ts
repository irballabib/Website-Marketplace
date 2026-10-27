import { describe, expect, it } from 'vitest';

import { generateUuidV7 } from './index';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateUuidV7', () => {
  it('generates a valid UUID v7', () => {
    expect(generateUuidV7()).toMatch(UUID_V7);
  });

  it('encodes the current timestamp in the first 48 bits', () => {
    const now = Date.now();
    const id = generateUuidV7();
    const timestamp = Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);

    expect(Math.abs(timestamp - now)).toBeLessThan(1000);
  });

  it('generates unique values for the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateUuidV7()));
    expect(ids.size).toBe(1000);
  });

  it('sorts chronologically for different timestamps', () => {
    const earlier = generateUuidV7(1_700_000_000_000);
    const later = generateUuidV7(1_700_000_000_001);

    expect(earlier < later).toBe(true);
  });
});
