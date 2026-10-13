import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/domain/calc';
import { blankProduct, defaultScenario } from '../src/domain/sample';
import type { Product, Scenario } from '../src/domain/types';

/**
 * Independent oracle: pure BigInt integer-cents arithmetic. It shares no code with the
 * Decimal-based engine, so agreement across hundreds of random scenarios shows there is
 * no floating-point or rounding drift.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const halfUpDiv = (num: bigint, den: bigint): bigint => (2n * num + den) / (2n * den);
const cents = (c: bigint): string => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`;
};

interface Case {
  product: Product;
  priceC: bigint;
  srcC: bigint;
  shipC: bigint;
  packC: bigint;
  otherC: bigint;
  feeBp: bigint;
  feeFixedC: bigint;
  promoBp: bigint;
  units: bigint;
}

function randomCase(rnd: () => number, i: number): Case {
  const int = (max: number) => BigInt(Math.floor(rnd() * max));
  const priceC = 100n + int(20000);
  const srcC = int(15000);
  const shipC = int(2000);
  const packC = int(300);
  const otherC = int(300);
  const feeBp = int(2500); // 0..24.99 %
  const feeFixedC = int(100);
  const promoBp = int(1000);
  const units = 1n + int(50);
  const product: Product = {
    ...blankProduct(`r${i}`),
    name: `R${i}`,
    sourceCost: cents(srcC),
    sourceShipping: cents(shipC),
    salePrice: cents(priceC),
    packaging: cents(packC),
    otherVariable: cents(otherC),
    feePercent: `${feeBp / 100n}.${(feeBp % 100n).toString().padStart(2, '0')}`,
    feeFixed: cents(feeFixedC),
    promoPercent: `${promoBp / 100n}.${(promoBp % 100n).toString().padStart(2, '0')}`,
    monthlyUnits: units.toString(),
  };
  return { product, priceC, srcC, shipC, packC, otherC, feeBp, feeFixedC, promoBp, units };
}

describe('integer-cents oracle agreement', () => {
  it('matches across 600 randomized scenarios (pool allocation)', () => {
    const rnd = mulberry32(20261013);
    const scenario: Scenario = {
      ...defaultScenario('s'),
      monthlyOverhead: '30.00',
      minNetProfit: '5.00',
      minMarginPercent: '15',
    };
    for (let batch = 0; batch < 60; batch += 1) {
      const cases = Array.from({ length: 10 }, (_, k) => randomCase(rnd, batch * 10 + k));
      const total = cases.reduce((s, c) => s + c.units, 0n);
      const overheadC = halfUpDiv(3000n, total);
      const { rows } = computeAll(
        cases.map((c) => c.product),
        scenario,
      );
      cases.forEach((c, k) => {
        const r = rows[k]!;
        const fee = halfUpDiv(c.priceC * c.feeBp, 10000n) + c.feeFixedC;
        const promo = halfUpDiv(c.priceC * c.promoBp, 10000n);
        const net = c.priceC - fee - promo - c.srcC - c.shipC - c.packC - c.otherC - overheadC;
        expect(r.net, `row ${c.product.name}`).toBe(cents(net));
        const okProfit = net >= 500n;
        const okMargin = net * 10000n >= 1500n * c.priceC;
        const expected =
          okProfit && okMargin
            ? 'qualifies'
            : okProfit
              ? 'fails_margin'
              : okMargin
                ? 'fails_profit'
                : 'fails_both';
        expect(r.gate, `gate ${c.product.name}`).toBe(expected);
        expect(r.rank !== null).toBe(r.gate === 'qualifies');
      });
    }
  });

  it('break-even is the first non-negative cent in its neighbourhood (300 cases)', () => {
    const rnd = mulberry32(777);
    const s: Scenario = { ...defaultScenario('s'), allocation: 'none' };
    for (let i = 0; i < 300; i += 1) {
      const c = randomCase(rnd, i);
      const row = computeAll([c.product], s).rows[0]!;
      const be = row.breakEven;
      expect(be).not.toBeNull();
      if (be === 'unattainable' || be === null) continue;
      const netAt = (priceC: bigint) =>
        priceC -
        (halfUpDiv(priceC * c.feeBp, 10000n) + c.feeFixedC) -
        halfUpDiv(priceC * c.promoBp, 10000n) -
        c.srcC -
        c.shipC -
        c.packC -
        c.otherC;
      const beC = BigInt(be.replace('.', ''));
      expect(netAt(beC) >= 0n).toBe(true);
      for (let d = 1n; d <= 5n; d += 1n) {
        if (beC - d >= 1n) expect(netAt(beC - d) < 0n).toBe(true);
      }
    }
  });

  it('negative-markup and missing-cost cases never qualify', () => {
    const rnd = mulberry32(5);
    const s = defaultScenario('s');
    for (let i = 0; i < 100; i += 1) {
      const c = randomCase(rnd, i);
      const underwater = {
        ...c.product,
        salePrice: cents(c.srcC > 100n ? c.srcC / 2n : 100n),
        sourceCost: cents(c.srcC + 500n),
      };
      const missing = { ...c.product, sourceShipping: '' };
      for (const p of [underwater, missing]) {
        const row = computeAll([p], s).rows[0]!;
        expect(row.gate).not.toBe('qualifies');
        expect(row.rank).toBeNull();
      }
    }
  });
});
