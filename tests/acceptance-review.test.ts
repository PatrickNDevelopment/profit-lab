import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/domain/calc';
import { defaultScenario, blankProduct } from '../src/domain/sample';
import type { Product, Scenario } from '../src/domain/types';

// Independent integer-cents oracle (BigInt) used by the acceptance review.
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cents = (s: string): bigint => {
  const [w, f = ''] = s.split('.');
  return BigInt(w!) * 100n + BigInt((f + '00').slice(0, 2));
};
const rnd = (n: bigint, bp: bigint): bigint => (n * bp + 5000n) / 10000n; // half-up, non-negative
const bpOf = (s: string): bigint => cents(s); // percent with 2dp == basis points

function oracleBreakEven(
  feeBp: bigint,
  fixed: bigint,
  promoBp: bigint,
  other: bigint,
  cap: bigint,
) {
  for (let p = 1n; p <= cap; p += 1n) {
    if (p - rnd(p, feeBp) - fixed - rnd(p, promoBp) - other >= 0n) return p;
  }
  return null;
}

describe('acceptance review: break-even vs exhaustive integer-cent search', () => {
  it('matches for high fee+promo rates (rounding noise dominates)', () => {
    const rand = mulberry32(2026);
    const bad: string[] = [];
    for (let i = 0; i < 400; i += 1) {
      const feePct = (rand() * 99 + 0.5).toFixed(2);
      const promoPct = (rand() * Math.max(0, 99.5 - Number(feePct))).toFixed(2);
      const fixed = (rand() * 2).toFixed(2);
      const cost = (rand() * 20).toFixed(2);
      const sc: Scenario = {
        ...defaultScenario('s'),
        feeTier: 'custom',
        customFeePercent: feePct,
        customFeeFixed: fixed,
        allocation: 'none',
      };
      const p: Product = {
        ...blankProduct('p'),
        sourceCost: cost,
        sourceShipping: '0.00',
        salePrice: '10.00',
        promoPercent: promoPct,
        monthlyUnits: '1',
      };
      const { rows } = computeAll([p], sc);
      const got = rows[0]!.breakEven;
      const exp = oracleBreakEven(
        bpOf(feePct),
        cents(fixed),
        bpOf(promoPct),
        cents(cost),
        5_000_000n,
      );
      const expS =
        exp === null ? 'unattainable' : `${exp / 100n}.${(exp % 100n).toString().padStart(2, '0')}`;
      if (got !== expS)
        bad.push(
          `fee=${feePct} promo=${promoPct} fixed=${fixed} cost=${cost}: got ${got} expected ${expS}`,
        );
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});

const fmtC = (c: bigint): string => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`;
};

describe('acceptance review: randomized scenarios agree with an independent BigInt oracle', () => {
  it('1500 scenarios: net, gate, rank, monthly and break-even are mutually consistent', () => {
    const rand = mulberry32(99);
    const money = (max: number) => (rand() * max).toFixed(2);
    const garbage = [
      '',
      ' ',
      'abc',
      '-1',
      '1e3',
      '1.234',
      '$',
      '%',
      '١٢٣',
      '1,5',
      'NaN',
      'Infinity',
      '9'.repeat(30),
    ];
    const problems: string[] = [];
    let qualified = 0;
    let checkedNet = 0;
    for (let iter = 0; iter < 1500; iter += 1) {
      const n = 1 + Math.floor(rand() * 5);
      const products: Product[] = [];
      for (let k = 0; k < n; k += 1) {
        const bad = () => (rand() < 0.08 ? garbage[Math.floor(rand() * garbage.length)]! : null);
        products.push({
          ...blankProduct(`p${k}`),
          name: rand() < 0.2 ? 'dup' : `n${k}`,
          sourceCost: bad() ?? money(120),
          sourceShipping: bad() ?? (rand() < 0.1 ? '' : money(15)),
          salePrice: bad() ?? money(250),
          competitorPrice: rand() < 0.5 ? '' : (bad() ?? money(250)),
          feePercent: rand() < 0.3 ? (bad() ?? money(40)) : '',
          feeFixed: rand() < 0.3 ? (bad() ?? money(2)) : '',
          promoPercent: rand() < 0.5 ? (bad() ?? money(15)) : '',
          packaging: bad() ?? money(3),
          otherVariable: bad() ?? money(3),
          monthlyUnits: bad() ?? String(Math.floor(rand() * 30)),
        });
      }
      const alloc = (['per_unit_pool', 'equal_per_product', 'none'] as const)[
        Math.floor(rand() * 3)
      ]!;
      const sc: Scenario = {
        ...defaultScenario('s'),
        pricingMode: rand() < 0.4 ? 'markup_retention' : 'entered',
        retentionPercent: String(Math.floor(rand() * 101)),
        feeTier: (['standard', 'reduced', 'high', 'custom'] as const)[Math.floor(rand() * 4)]!,
        customFeePercent: money(30),
        customFeeFixed: money(1),
        monthlyOverhead: money(100),
        allocation: alloc,
        minNetProfit: money(10),
        minMarginPercent: money(30),
      };
      const { rows, summary } = computeAll(products, sc);
      let rankCount = 0;
      let monthly = 0n;
      rows.forEach((r) => {
        const tag = `iter ${iter} ${r.id}`;
        const nums = [
          r.price,
          r.net,
          r.fee,
          r.promo,
          r.landedCost,
          r.otherCosts,
          r.marginPercent,
          r.monthlyNet,
          r.breakEven,
        ];
        for (const v of nums)
          if (v !== null && !/^-?\d+(\.\d+)?$|^unattainable$/.test(v))
            problems.push(`${tag}: bad number text ${v}`);
        if ((r.rank !== null) !== (r.gate === 'qualifies'))
          problems.push(`${tag}: rank/gate mismatch`);
        if (r.gate === 'incomplete' && (r.net !== null || r.rank !== null || r.monthlyNet !== null))
          problems.push(`${tag}: incomplete row has results`);
        if (r.gate !== 'incomplete' && r.issues.length > 0)
          problems.push(`${tag}: complete row has issues`);
        if (r.rank !== null) rankCount += 1;
        if (r.gate === 'incomplete') return;
        // independent recomputation
        const px = cents(r.price!);
        const feeBp = r.feePercentUsed!.includes('.')
          ? bpOf(r.feePercentUsed!)
          : BigInt(r.feePercentUsed!) * 100n;
        const fixed = cents(r.feeFixedUsed!);
        const feeC = rnd(px, feeBp) + fixed;
        if (fmtC(feeC) !== r.fee) problems.push(`${tag}: fee ${r.fee} != ${fmtC(feeC)}`);
        const netC = px - feeC - cents(r.promo!) - cents(r.otherCosts!);
        if (fmtC(netC) !== r.net) problems.push(`${tag}: net ${r.net} != ${fmtC(netC)}`);
        checkedNet += 1;
        const minNet = cents(sc.minNetProfit);
        const minMarginBp = bpOf(sc.minMarginPercent); // percent*100
        const okP = netC >= minNet;
        const okM = netC * 10000n >= px * minMarginBp; // net/price >= pct/100
        const exp =
          okP && okM ? 'qualifies' : okP ? 'fails_margin' : okM ? 'fails_profit' : 'fails_both';
        if (exp !== r.gate)
          problems.push(`${tag}: gate ${r.gate} != ${exp} (net ${r.net} price ${r.price})`);
        if (r.gate === 'qualifies') {
          qualified += 1;
          if (r.monthlyNet !== null) monthly += cents(r.monthlyNet);
        }
        // break-even consistency: at the stated break-even net >= 0
        if (r.breakEven && r.breakEven !== 'unattainable') {
          const be = cents(r.breakEven);
          const beNet =
            be -
            rnd(be, feeBp) -
            fixed -
            rnd(be, bpOf(products.find((p) => p.id === r.id)!.promoPercent || '0')) -
            cents(r.otherCosts!);
          if (beNet < 0n) problems.push(`${tag}: break-even ${r.breakEven} has negative net`);
          if (be > px && netC >= 0n) problems.push(`${tag}: break-even above price while net>=0`);
        }
      });
      if (summary.qualifying !== rankCount)
        problems.push(`iter ${iter}: summary.qualifying mismatch`);
      if (summary.rows !== rows.length) problems.push('rows mismatch');
      if (fmtC(monthly) !== summary.monthlyNetQualifying)
        problems.push(`iter ${iter}: monthly ${summary.monthlyNetQualifying} != ${fmtC(monthly)}`);
      const ranks = rows
        .filter((r) => r.rank !== null)
        .map((r) => r.rank!)
        .sort((a, b) => a - b);
      ranks.forEach((v, i) => {
        if (v !== i + 1) problems.push(`iter ${iter}: ranks not 1..n`);
      });
    }
    expect(problems.slice(0, 15)).toEqual([]);
    expect(checkedNet).toBeGreaterThan(1000);
    expect(qualified).toBeGreaterThan(50);
  });

  it('extreme and degenerate inputs never produce NaN, negative zero or throw', () => {
    const sc = (o: Partial<Scenario> = {}): Scenario => ({ ...defaultScenario('s'), ...o });
    const p = (o: Partial<Product>): Product => ({
      ...blankProduct('x'),
      sourceCost: '1.00',
      sourceShipping: '0.00',
      salePrice: '10.00',
      monthlyUnits: '1',
      ...o,
    });
    const cases: [Product[], Scenario][] = [
      [[p({ sourceCost: '1000000000', salePrice: '1000000000', monthlyUnits: '10000000' })], sc()],
      [[p({ monthlyUnits: '0' })], sc()],
      [[p({ monthlyUnits: '0' })], sc({ allocation: 'equal_per_product' })],
      [
        [p({ monthlyUnits: '0' }), p({ monthlyUnits: '5' })].map((x, i) => ({ ...x, id: `i${i}` })),
        sc({ allocation: 'equal_per_product' }),
      ],
      [
        [p({ salePrice: '0.01', sourceCost: '0.00' })],
        sc({ monthlyOverhead: '0', allocation: 'none' }),
      ],
      [
        [p({ competitorPrice: '0.50' })],
        sc({ pricingMode: 'markup_retention', retentionPercent: '0' }),
      ],
      [
        [p({ competitorPrice: '0.50' })],
        sc({ pricingMode: 'markup_retention', retentionPercent: '100' }),
      ],
      [[p({ competitorPrice: '5.00' })], sc({ pricingMode: 'markup_retention' })],
      [[p({ feePercent: '100', promoPercent: '0' })], sc()],
      [[p({ feePercent: '99.99', promoPercent: '0' })], sc()],
      [[p({ feePercent: '50', promoPercent: '50' })], sc()],
      [[p({ feePercent: '50', promoPercent: '49.99' })], sc({ monthlyOverhead: '0' })],
      [[p({ name: 'x'.repeat(5000) })], sc()],
    ];
    for (const [prods, s] of cases) {
      const { rows, summary } = computeAll(prods, s);
      const blob = JSON.stringify({ rows, summary });
      expect(blob).not.toMatch(/NaN|Infinity|undefined/);
      for (const r of rows) {
        if (r.net !== null) expect(r.net).not.toBe('-0.00');
        if (r.rank !== null) expect(r.gate).toBe('qualifies');
      }
    }
  });
});

describe('acceptance review regressions', () => {
  const H = 'name,source_cost,source_shipping,sale_price\r\n';
  let n = 0;
  const id = () => `r${n++}`;

  it('break-even is exact for a 40% fee + 54% promo (previously 13 cents too high)', () => {
    const sc: Scenario = {
      ...defaultScenario('s'),
      feeTier: 'custom',
      customFeePercent: '40.76',
      customFeeFixed: '1.13',
      allocation: 'none',
    };
    const p: Product = {
      ...blankProduct('p'),
      sourceCost: '0.03',
      sourceShipping: '0.00',
      salePrice: '30.00',
      promoPercent: '54.09',
      monthlyUnits: '1',
    };
    expect(computeAll([p], sc).rows[0]!.breakEven).toBe('22.36');
  });

  it('a blank/invalid disabled retention field does not make rows incomplete in entered mode', () => {
    const sc: Scenario = { ...defaultScenario('s'), retentionPercent: '', allocation: 'none' };
    const p: Product = {
      ...blankProduct('p'),
      sourceCost: '5.00',
      sourceShipping: '0.00',
      salePrice: '30.00',
      monthlyUnits: '1',
    };
    expect(computeAll([p], sc).rows[0]!.gate).toBe('qualifies');
    const r = computeAll([p], { ...sc, pricingMode: 'markup_retention' }).rows[0]!;
    expect(r.gate).toBe('incomplete');
  });

  it('names starting with an apostrophe + formula char survive an export/import round trip', async () => {
    const { productsToCsv, importProductsCsv } = await import('../src/domain/csv');
    for (const name of ["'-5 thermometer", "''=x", '=1+1', '+SUM(A1)', '@cmd', "'plain", '-3']) {
      const p: Product = {
        ...blankProduct('a'),
        name,
        sourceCost: '1.00',
        sourceShipping: '0.00',
        salePrice: '5.00',
      };
      const back = importProductsCsv(productsToCsv([p]), id).rows[0]!.product!.name;
      expect(back).toBe(name);
    }
  });

  it('every exported input cell is formula-guarded, including numeric text fields', async () => {
    const { productsToCsv, parseCsv } = await import('../src/domain/csv');
    const evil = '=HYPERLINK("http://example.com","x")';
    const p: Product = { ...blankProduct('a'), name: 'x', sourceCost: evil, packaging: '@SUM(1)' };
    for (const row of parseCsv(productsToCsv([p])).slice(1)) {
      for (const c of row) expect(/^[=+\-@\t\r]/.test(c)).toBe(false);
    }
  });

  it('rejects duplicate headers and unterminated quotes instead of guessing', async () => {
    const { importProductsCsv } = await import('../src/domain/csv');
    const dup = importProductsCsv('name,source_cost,source_cost,sale_price\nA,1,99,5\n', id);
    expect(dup.fileErrors.join(' ')).toMatch(/more than once/);
    const open = importProductsCsv(H + '"A,1,0,5\nB,1,0,5\n', id);
    expect(open.fileErrors.join(' ')).toMatch(/never closed/);
  });

  it('workspace JSON: duplicate ids rejected, unknown active scenario normalised', async () => {
    const { parseStateJson } = await import('../src/domain/storage');
    const s = defaultScenario('s1');
    const base = { schemaVersion: 1, products: [], scenarios: [s], activeScenarioId: 'nope' };
    expect(parseStateJson(JSON.stringify(base)).activeScenarioId).toBe('s1');
    expect(() => parseStateJson(JSON.stringify({ ...base, scenarios: [s, s] }))).toThrow();
    const p = blankProduct('same');
    expect(() => parseStateJson(JSON.stringify({ ...base, products: [p, p] }))).toThrow();
  });

  it('warns when a displayed margin rounds up to the gate but the exact value fails', () => {
    const sc: Scenario = {
      ...defaultScenario('s'),
      allocation: 'none',
      feeTier: 'custom',
      customFeePercent: '0',
      customFeeFixed: '0',
      minNetProfit: '0',
      minMarginPercent: '15',
    };
    // net 10.00 on price 66.67 = 14.9993%: displays 15.00% but needs 10.0005.
    const p: Product = {
      ...blankProduct('p'),
      sourceCost: '56.67',
      sourceShipping: '0.00',
      salePrice: '66.67',
      monthlyUnits: '1',
    };
    const r = computeAll([p], sc).rows[0]!;
    expect(r.marginPercent).toBe('15.00');
    expect(r.gate).toBe('fails_margin');
    expect(r.warnings.join(' ')).toMatch(/Margin displays as 15\.00%/);
  });
});
