import Decimal from 'decimal.js';

/** Isolated Decimal constructor: 40 significant digits, half-up rounding (as marketplaces round fees). */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export type FieldKind = 'money' | 'percent' | 'units';

export type FieldRead =
  { kind: 'blank' } | { kind: 'ok'; value: Dec } | { kind: 'error'; message: string };

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const MONEY_THOUSANDS_RE = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;
const PERCENT_RE = /^\d+(\.\d{1,2})?$/;
const UNITS_RE = /^\d+$/;
const MAX_MONEY = new D('1000000000');
const MAX_UNITS = 10_000_000;

/** Strictly reads user text. Never guesses: anything ambiguous is an error. */
export function readField(raw: string, kind: FieldKind): FieldRead {
  const text = raw.trim();
  if (text === '') return { kind: 'blank' };
  if (kind === 'money') {
    let t = text.startsWith('$') ? text.slice(1).trim() : text;
    if (MONEY_THOUSANDS_RE.test(t)) t = t.replace(/,/g, '');
    if (!MONEY_RE.test(t)) {
      return { kind: 'error', message: 'must be a non-negative amount with at most 2 decimals' };
    }
    const v = new D(t);
    if (v.gt(MAX_MONEY)) return { kind: 'error', message: 'is unrealistically large' };
    return { kind: 'ok', value: v };
  }
  if (kind === 'percent') {
    const t = text.endsWith('%') ? text.slice(0, -1).trim() : text;
    if (!PERCENT_RE.test(t)) {
      return { kind: 'error', message: 'must be a percentage with at most 2 decimals' };
    }
    const v = new D(t);
    if (v.gt(100)) return { kind: 'error', message: 'cannot exceed 100%' };
    return { kind: 'ok', value: v };
  }
  if (!UNITS_RE.test(text)) return { kind: 'error', message: 'must be a whole number' };
  const n = Number(text);
  if (n > MAX_UNITS) return { kind: 'error', message: 'is unrealistically large' };
  return { kind: 'ok', value: new D(text) };
}

export function roundCents(x: Dec): Dec {
  return x.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function fmt(x: Dec): string {
  return roundCents(x).toFixed(2);
}

/** Canonical money text for storage/CSV: 2 decimals. */
export function canonicalMoney(x: Dec): string {
  return x.toFixed(2);
}
