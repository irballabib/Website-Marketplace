import { describe, expect, it } from 'vitest';

import { Money, formatRupiah, money, sumMoney } from './index';

describe('Money', () => {
  it('adds decimal values without floating point drift', () => {
    expect(money('0.1').add('0.2').toString()).toBe('0.30');
  });

  it('subtracts, multiplies and divides', () => {
    const price = money('199000.00');

    expect(price.sub('99000').toString()).toBe('100000.00');
    expect(price.mul(2).toString()).toBe('398000.00');
    expect(price.div(2).toString()).toBe('99500.00');
  });

  it('calculates percentages using half-up rounding', () => {
    expect(money('199000').percent(30).toString()).toBe('59700.00');
    expect(money('199999').percent(7.5).toString()).toBe('14999.93');
  });

  it('compares values', () => {
    expect(money('100').eq('100.00')).toBe(true);
    expect(money('100').gt('99.99')).toBe(true);
    expect(money('100').lt('100.01')).toBe(true);
  });

  it('rejects invalid money strings', () => {
    expect(() => money('1,000')).toThrow(/Invalid money format/);
    expect(() => money('-5')).toThrow(/Invalid money format/);
  });

  it('sums a list of money values', () => {
    expect(sumMoney([money('1000'), money('2500.50'), money('0')]).toString()).toBe('3500.50');
  });

  it('keeps Money immutable', () => {
    const base = new Money('1000');
    base.add('500');
    expect(base.toString()).toBe('1000.00');
  });
});

describe('formatRupiah', () => {
  it('formats with the IDR currency symbol by default', () => {
    expect(formatRupiah('199000')).toContain('199.000');
  });

  it('supports compact notation', () => {
    expect(formatRupiah('1500000', { compact: true })).toBe('Rp 1.5M');
  });

  it('returns zero for invalid input', () => {
    expect(formatRupiah('not-a-number')).toBe('Rp 0');
  });
});
