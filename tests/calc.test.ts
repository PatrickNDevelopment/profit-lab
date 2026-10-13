import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/domain/calc';
import { defaultScenario, blankProduct, sampleProducts } from '../src/domain/sample';
import type { Product, Scenario } from '../src/domain/types';

let n = 0;
const id = () => `t${(n += 1)}`;
const scen = (over: Partial<Scenario> = {}): Scenario => ({ ...defaultScenario('s'), ...over });
const prod = (over: Partial<Product>): Product => ({
  ...blankProduct(id()),
  name: 'P',
  sourceCost: '10.00',
  sourceShipping: '0.00',
  salePrice: '30.00',
  monthlyUnits: '10',
  ...over,
});

describe('exact money arithmetic', () => {
  it('0.1 + 0.2 style inputs do not drift', () => {
    const { rows } = computeAll(
      [prod({ sourceCost: '0.10', sourceShipping: '0.20', salePrice: '1.00', packaging: '0.00' })],
      scen({ allocation: 'none', feeTier: 'custom', customFeePercent: '0', customFeeFixed: '0' }),
    );
    expect(rows[0]?.landedCost).toBe('0.30');
    expect(rows[0]?.net).toBe('0.70');
  });

  it('rounds fees half-up at the cent', () => {
    // 30.00 * 13.25% = 3.975 -> 3.98, + 0.30
    const { rows } = computeAll([prod({})], scen({ allocation: 'none' }));
    expect(rows[0]?.fee).toBe('4.28');
  });
});

describe('sample data boundaries (default scenario)', () => {
  const products = sampleProducts(id);
  const { rows, summary } = computeAll(products, scen());
  const by = (i: number) => rows[i]!;

  it('net exactly at the profit gate qualifies', () => {
    expect(by(0).net).toBe('5.00');
    expect(by(0).gate).toBe('qualifies');
  });
  it('one cent short fails the profit gate only', () => {
    expect(by(1).net).toBe('4.99');
    expect(by(1).gate).toBe('fails_profit');
  });
  it('margin exactly 15% qualifies', () => {
    expect(by(2).marginPercent).toBe('15.00');
    expect(by(2).gate).toBe('qualifies');
  });
  it('high markup but unprofitable fails', () => {
    expect(by(3).net).toBe('-1.80');
    expect(by(3).gate).toBe('fails_both');
  });
  it('low markup in a low-fee channel can qualify', () => {
    expect(by(4).gate).toBe('qualifies');
  });
  it('unknown shipping is incomplete, never qualifying', () => {
    expect(by(5).gate).toBe('incomplete');
    expect(by(5).net).toBeNull();
    expect(by(5).issues.join(' ')).toMatch(/shipping is unknown/);
  });
  it('summary adds up', () => {
    expect(summary.rows).toBe(8);
    expect(summary.qualifying + summary.failing + summary.incomplete).toBe(8);
  });
  it('ranks exist only for qualifying rows', () => {
    for (const r of rows) expect(r.rank !== null).toBe(r.gate === 'qualifies');
  });
});

describe('scenario changes are deterministic', () => {
  const products = sampleProducts(id);
  it('a higher fee tier flips the fee-sensitive row', () => {
    const std = computeAll(products, scen()).rows[7]!;
    const high = computeAll(products, scen({ feeTier: 'high' })).rows[7]!;
    expect(std.gate).toBe('qualifies');
    expect(high.gate).toBe('fails_profit');
  });
  it('same inputs give identical output twice', () => {
    expect(computeAll(products, scen())).toEqual(computeAll(products, scen()));
  });
  it('allocation "none" flags unallocated overhead instead of silently using zero', () => {
    const { rows, summary } = computeAll(products, scen({ allocation: 'none' }));
    expect(summary.unallocatedOverhead).toBe('30.00');
    expect(rows[0]?.warnings.join(' ')).toMatch(/NOT allocated/);
  });
  it('per-unit pool allocates 30/60 = 0.50', () => {
    expect(computeAll(products, scen()).rows[0]?.overheadPerUnit).toBe('0.50');
  });
  it('equal-per-product divides across products then units', () => {
    // 30 / 8 products = 3.75 per product; / 10 units = 0.375 -> 0.38
    expect(
      computeAll(products, scen({ allocation: 'equal_per_product' })).rows[0]?.overheadPerUnit,
    ).toBe('0.38');
  });
  it('missing units block allocation visibly', () => {
    const { rows } = computeAll([prod({ monthlyUnits: '' })], scen());
    expect(rows[0]?.gate).toBe('incomplete');
    expect(rows[0]?.issues.join(' ')).toMatch(/Monthly units are required/);
  });
});

describe('markup-retention rule', () => {
  it('shows exact equation and undercut', () => {
    const p = prod({
      sourceCost: '8.00',
      sourceShipping: '4.00',
      competitorPrice: '30.00',
      salePrice: '',
    });
    const r = computeAll([p], scen({ pricingMode: 'markup_retention', allocation: 'none' }))
      .rows[0]!;
    expect(r.price).toBe('28.20'); // 12 + 0.9 * 18
    expect(r.undercut).toBe('1.80');
    expect(r.equation).toContain('12.00 + 0.9000 × (30.00 − 12.00) = 28.20');
    expect(r.priceSource).toBe('markup_rule');
  });
  it('falls back to the entered price with a visible warning', () => {
    const r = computeAll(
      [prod({ competitorPrice: '' })],
      scen({ pricingMode: 'markup_retention', allocation: 'none' }),
    ).rows[0]!;
    expect(r.priceSource).toBe('entered');
    expect(r.warnings.join(' ')).toMatch(/No competitor price/);
  });
  it('warns when competitor price does not exceed cost', () => {
    const p = prod({ sourceCost: '20.00', competitorPrice: '15.00', salePrice: '' });
    const r = computeAll([p], scen({ pricingMode: 'markup_retention', allocation: 'none' }))
      .rows[0]!;
    expect(r.warnings.join(' ')).toMatch(/does not exceed/);
  });
  it('is optional: default mode uses entered prices', () => {
    const r = computeAll([prod({ competitorPrice: '50.00' })], scen({ allocation: 'none' }))
      .rows[0]!;
    expect(r.priceSource).toBe('entered');
    expect(r.price).toBe('30.00');
  });
});

describe('validation and failure states', () => {
  it('invalid text is an issue, not a silent zero', () => {
    const r = computeAll([prod({ sourceCost: 'abc' })], scen()).rows[0]!;
    expect(r.gate).toBe('incomplete');
    expect(r.issues.join(' ')).toMatch(/Source cost must be/);
  });
  it('negative values are rejected', () => {
    const r = computeAll([prod({ packaging: '-1' })], scen()).rows[0]!;
    expect(r.gate).toBe('incomplete');
  });
  it('3-decimal money is rejected rather than rounded', () => {
    const r = computeAll([prod({ salePrice: '10.005' })], scen()).rows[0]!;
    expect(r.gate).toBe('incomplete');
  });
  it('invalid scenario settings make rows incomplete with the reason', () => {
    const r = computeAll([prod({})], scen({ minNetProfit: 'x' })).rows[0]!;
    expect(r.gate).toBe('incomplete');
    expect(r.issues.join(' ')).toMatch(/Minimum net profit/);
  });
  it('empty product list is fine', () => {
    const { rows, summary } = computeAll([], scen());
    expect(rows).toEqual([]);
    expect(summary.qualifying).toBe(0);
  });
  it('fees at 100% make break-even unattainable', () => {
    const r = computeAll([prod({ feePercent: '100' })], scen({ allocation: 'none' })).rows[0]!;
    expect(r.breakEven).toBe('unattainable');
  });
});

describe('break-even', () => {
  it('is the lowest cent price with non-negative net', () => {
    const p = prod({ sourceCost: '20.00', packaging: '1.00' });
    const s = scen({ allocation: 'none' });
    const be = computeAll([p], s).rows[0]!.breakEven as string;
    const at = (price: string) => computeAll([{ ...p, salePrice: price }], s).rows[0]!.net!;
    expect(Number(at(be))).toBeGreaterThanOrEqual(0);
    const below = (Number(be) - 0.01).toFixed(2);
    expect(Number(at(below))).toBeLessThan(0);
  });
});
