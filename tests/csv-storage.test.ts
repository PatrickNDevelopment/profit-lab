import { describe, expect, it } from 'vitest';
import {
  importProductsCsv,
  parseCsv,
  productsToCsv,
  resultsToCsv,
  guardFormula,
} from '../src/domain/csv';
import { computeAll } from '../src/domain/calc';
import { defaultScenario, sampleProducts } from '../src/domain/sample';
import {
  BACKUP_KEY,
  STORAGE_KEY,
  emptyState,
  loadState,
  saveState,
  type KeyValueStore,
} from '../src/domain/storage';

let n = 0;
const id = () => `c${(n += 1)}`;

describe('CSV parser', () => {
  it('handles quotes, embedded commas/newlines, CRLF and BOM', () => {
    const t = '﻿a,b\r\n"x, y","line1\nline2"\r\n"he said ""hi""",z';
    expect(parseCsv(t)).toEqual([
      ['a', 'b'],
      ['x, y', 'line1\nline2'],
      ['he said "hi"', 'z'],
    ]);
  });
});

describe('CSV import validation', () => {
  const header = 'name,source_cost,source_shipping,sale_price,competitor_price,monthly_units';
  it('reports row-level errors with line numbers and imports only valid rows', () => {
    const csv = `${header}\nGood,10.00,2.00,30.00,,5\nBad,abc,2.00,30.00,,5\n,5,1,10,,1\nNeg,5,-1,10,,1\n`;
    const r = importProductsCsv(csv, id);
    expect(r.validCount).toBe(1);
    expect(r.invalidCount).toBe(3);
    const bad = r.rows.find((x) => x.line === 3)!;
    expect(bad.errors.join(' ')).toMatch(/source_cost must be/);
    expect(r.rows.find((x) => x.line === 4)!.errors.join(' ')).toMatch(/name is required/);
    expect(r.rows.find((x) => x.line === 5)!.errors.join(' ')).toMatch(/source_shipping must be/);
  });
  it('a corrected file then imports cleanly', () => {
    const fixed = `${header}\nGood,10.00,2.00,30.00,,5\nBad,9.50,2.00,30.00,,5\n`;
    const r = importProductsCsv(fixed, id);
    expect(r.invalidCount).toBe(0);
    expect(r.validCount).toBe(2);
  });
  it('rejects files missing required columns', () => {
    const r = importProductsCsv('foo,bar\n1,2\n', id);
    expect(r.fileErrors.join(' ')).toMatch(/Missing required column "name"/);
  });
  it('warns that blank shipping is unknown, not zero', () => {
    const r = importProductsCsv(`${header}\nA,10,,30,,5\n`, id);
    expect(r.rows[0]?.warnings.join(' ')).toMatch(/UNKNOWN/);
    const { rows } = computeAll([r.rows[0]!.product!], defaultScenario('s'));
    expect(rows[0]?.gate).toBe('incomplete');
  });
  it('treats a price-less row as an error', () => {
    const r = importProductsCsv(`${header}\nA,10,1,,,5\n`, id);
    expect(r.rows[0]?.errors.join(' ')).toMatch(/sale_price or a competitor_price/);
  });
  it('refuses oversized input', () => {
    const r = importProductsCsv('x'.repeat(1_100_000), id);
    expect(r.fileErrors.join(' ')).toMatch(/larger than/);
  });
});

describe('CSV export', () => {
  it('neutralises formula injection in text cells', () => {
    expect(guardFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(guardFormula('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(guardFormula('Normal')).toBe('Normal');
  });
  it('inputs round-trip through export and import', () => {
    const products = sampleProducts(id);
    products[0]!.name = '=cmd|calc, "quoted"';
    const csv = productsToCsv(products);
    const back = importProductsCsv(csv, id);
    expect(back.invalidCount).toBe(0);
    const strip = (p: (typeof products)[number]) => ({ ...p, id: '', synthetic: false });
    expect(back.rows.map((r) => r.product!).map(strip)).toEqual(products.map(strip));
  });
  it('results export labels values as projected and includes qualification', () => {
    const s = defaultScenario('s');
    const products = sampleProducts(id);
    const csv = resultsToCsv(computeAll(products, s).rows, s);
    expect(csv).toContain('projected_net_profit_per_unit');
    expect(csv).toContain('Qualifies');
    expect(csv.split('\r\n')[1]).toMatch(/projected$/);
  });
});

function memoryStore(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('persistence', () => {
  it('round-trips state', () => {
    const store = memoryStore();
    const s = emptyState(id);
    s.products = sampleProducts(id);
    expect(saveState(store, s)).toBe(true);
    const loaded = loadState(store, id);
    expect(loaded.notice).toBeNull();
    expect(loaded.state).toEqual(s);
  });
  it('recovers from corrupt data, keeping a backup', () => {
    const store = memoryStore({ [STORAGE_KEY]: '{not json' });
    const loaded = loadState(store, id);
    expect(loaded.notice).toMatch(/unreadable/);
    expect(store.data[BACKUP_KEY]).toBe('{not json');
    expect(loaded.state.products).toEqual([]);
  });
  it('rejects schema-invalid data', () => {
    const store = memoryStore({
      [STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, products: 'x' }),
    });
    expect(loadState(store, id).notice).toMatch(/unreadable/);
  });
  it('refuses to overwrite data from a newer schema', () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 2 }) });
    const loaded = loadState(store, id);
    expect(loaded.readOnlyUntilReset).toBe(true);
    expect(loaded.notice).toMatch(/newer version/);
  });
  it('survives a throwing store', () => {
    const bad: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadState(bad, id).notice).toMatch(/unavailable/);
    expect(saveState(bad, emptyState(id))).toBe(false);
  });
});
