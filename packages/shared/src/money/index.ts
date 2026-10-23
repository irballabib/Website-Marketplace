import { Decimal } from 'decimal.js';
import { moneyInputSchema } from '../zod';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/** Money class wrapper around Decimal for type safety */
export class Money {
  private readonly value: Decimal;

  constructor(value: string | number | Decimal) {
    if (typeof value === 'string') {
      const parsed = moneyInputSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error(`Invalid money format: ${value}`);
      }
      this.value = new Decimal(value);
    } else if (typeof value === 'number') {
      this.value = new Decimal(value.toFixed(2));
    } else {
      this.value = value;
    }
  }

  /** Get raw Decimal */
  toDecimal(): Decimal {
    return this.value;
  }

  /** Get string with 2 decimals */
  toString(): string {
    return this.value.toFixed(2);
  }

  /** Get number (use carefully - precision loss possible) */
  toNumber(): number {
    return this.value.toNumber();
  }

  /** Format as Rupiah */
  format(options?: { symbol?: boolean; compact?: boolean }): string {
    return formatRupiah(this.toString(), options);
  }

  /** Addition */
  add(other: Money | string | number): Money {
    return new Money(this.value.plus(new Decimal(other.toString?.() ?? other)));
  }

  /** Subtraction */
  sub(other: Money | string | number): Money {
    return new Money(this.value.minus(new Decimal(other.toString?.() ?? other)));
  }

  /** Multiplication */
  mul(other: Money | string | number): Money {
    return new Money(this.value.times(new Decimal(other.toString?.() ?? other)));
  }

  /** Division */
  div(other: Money | string | number): Money {
    return new Money(this.value.dividedBy(new Decimal(other.toString?.() ?? other)));
  }

  /** Percentage */
  percent(percentage: number): Money {
    return this.mul(percentage / 100);
  }

  /** Comparison */
  eq(other: Money | string | number): boolean {
    return this.value.eq(new Decimal(other.toString?.() ?? other));
  }

  lt(other: Money | string | number): boolean {
    return this.value.lt(new Decimal(other.toString?.() ?? other));
  }

  lte(other: Money | string | number): boolean {
    return this.value.lte(new Decimal(other.toString?.() ?? other));
  }

  gt(other: Money | string | number): boolean {
    return this.value.gt(new Decimal(other.toString?.() ?? other));
  }

  gte(other: Money | string | number): boolean {
    return this.value.gte(new Decimal(other.toString?.() ?? other));
  }

  /** Absolute value */
  abs(): Money {
    return new Money(this.value.abs());
  }

  /** Check if zero */
  isZero(): boolean {
    return this.value.isZero();
  }

  /** Check if positive */
  isPositive(): boolean {
    return this.value.isPositive();
  }

  /** Check if negative */
  isNegative(): boolean {
    return this.value.isNegative();
  }

  /** Round to 2 decimals */
  round(): Money {
    return new Money(this.value.toFixed(2));
  }
}

/** Create Money from string/number */
export function money(value: string | number): Money {
  return new Money(value);
}

/** Zero money */
export const ZERO = money('0');

/** Sum multiple money values */
export function sumMoney(values: Money[]): Money {
  return values.reduce((acc, val) => acc.add(val), ZERO);
}

/** Multiply money by quantity */
export function multiplyMoney(m: Money, qty: number): Money {
  return m.mul(qty);
}

/** Divide money by quantity */
export function divideMoney(m: Money, qty: number): Money {
  return m.div(qty);
}

/** Calculate percentage */
export function calculatePercentage(base: Money, percentage: number): Money {
  return base.percent(percentage);
}

/** Format rupiah helper (re-export from utils) */
export function formatRupiah(amount: string | number, options?: { symbol?: boolean; compact?: boolean }): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return options?.symbol ? 'Rp 0' : '0';

  if (options?.compact) {
    if (num >= 1_000_000_000) return `${options.symbol ? 'Rp ' : ''}${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${options.symbol ? 'Rp ' : ''}${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${options.symbol ? 'Rp ' : ''}${(num / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat('id-ID', {
    style: options?.symbol ? 'currency' : 'decimal',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}