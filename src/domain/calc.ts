import { D, fmt, readField, roundCents, type Dec } from './numbers';
import { FEE_TIERS } from './feeTiers';
import type { Gate, Product, RowResult, Scenario, Summary } from './types';

interface ScenarioParams {
  issues: string[];
  retention: Dec;
  overhead: Dec;
  minNet: Dec;
  minMargin: Dec;
  tierPercent: Dec;
  tierFixed: Dec;
}

function readOr(raw: string, kind: 'money' | 'percent', label: string, issues: string[]): Dec {
  const r = readField(raw, kind);
  if (r.kind === 'ok') return r.value;
  issues.push(r.kind === 'blank' ? `${label} is required` : `${label} ${r.message}`);
  return new D(0);
}

export function scenarioParams(s: Scenario): ScenarioParams {
  const issues: string[] = [];
  // The retention field is disabled in "entered prices" mode, so only validate it when it is used.
  const retention =
    s.pricingMode === 'markup_retention'
      ? readOr(s.retentionPercent, 'percent', 'Markup retention', issues)
      : new D(0);
  const overhead = readOr(s.monthlyOverhead, 'money', 'Monthly overhead', issues);
  const minNet = readOr(s.minNetProfit, 'money', 'Minimum net profit', issues);
  const minMargin = readOr(s.minMarginPercent, 'percent', 'Minimum margin', issues);
  let tierPercent: Dec;
  let tierFixed: Dec;
  if (s.feeTier === 'custom') {
    tierPercent = readOr(s.customFeePercent, 'percent', 'Custom fee percent', issues);
    tierFixed = readOr(s.customFeeFixed, 'money', 'Custom fixed fee', issues);
  } else {
    tierPercent = new D(FEE_TIERS[s.feeTier].percent);
    tierFixed = new D(FEE_TIERS[s.feeTier].fixed);
  }
  return { issues, retention, overhead, minNet, minMargin, tierPercent, tierFixed };
}

interface Pool {
  totalUnits: Dec;
  /** products with units > 0 */
  unitProducts: number;
}

function buildPool(products: Product[]): Pool {
  let total = new D(0);
  let n = 0;
  for (const p of products) {
    const u = readField(p.monthlyUnits, 'units');
    if (u.kind === 'ok') {
      total = total.plus(u.value);
      if (u.value.gt(0)) n += 1;
    }
  }
  return { totalUnits: total, unitProducts: n };
}

function feeAt(price: Dec, pct: Dec, fixed: Dec): Dec {
  return roundCents(price.times(pct).div(100)).plus(fixed);
}
function promoAt(price: Dec, pct: Dec): Dec {
  return roundCents(price.times(pct).div(100));
}

/** Smallest cent price (searched from just below the analytic value) with net >= 0. */
function findBreakEven(
  feePct: Dec,
  feeFixed: Dec,
  promoPct: Dec,
  otherCosts: Dec,
): string | 'unattainable' {
  const rate = feePct.plus(promoPct).div(100);
  if (rate.gte(1)) return 'unattainable';
  const fixedTotal = feeFixed.plus(otherCosts);
  const keep = new D(1).minus(rate); // share of each price dollar kept after % fees
  // The two cent-roundings move net by at most 0.01 in total, so net(p) is bounded by
  // p*keep - fixedTotal +/- 0.01. No price below `low` can reach net >= 0 and every price at or
  // above `high` does. Scan exactly that band (width 0.02/keep, so wide only for extreme rates).
  const low = fixedTotal.minus('0.01').div(keep);
  const high = fixedTotal.plus('0.01').div(keep).plus('0.02');
  let p = low.toDecimalPlaces(2, D.ROUND_FLOOR).minus('0.01');
  if (p.lt('0.01')) p = new D('0.01');
  for (; p.lte(high); p = p.plus('0.01')) {
    const net = p
      .minus(feeAt(p, feePct, feeFixed))
      .minus(promoAt(p, promoPct))
      .minus(otherCosts);
    if (net.gte(0)) return fmt(p);
  }
  return 'unattainable';
}

export function computeRow(p: Product, s: Scenario, sp: ScenarioParams, pool: Pool): RowResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const costIssues: string[] = [];
  const priceIssues: string[] = [];

  const take = (
    raw: string,
    kind: 'money' | 'percent' | 'units',
    label: string,
    into: string[],
  ) => {
    const r = readField(raw, kind);
    if (r.kind === 'ok') return r.value;
    if (r.kind === 'error') into.push(`${label} ${r.message}`);
    return null;
  };

  const source = take(p.sourceCost, 'money', 'Source cost', costIssues);
  if (p.sourceCost.trim() === '') costIssues.push('Source cost is missing');
  const shipping = take(p.sourceShipping, 'money', 'Source shipping', costIssues);
  if (p.sourceShipping.trim() === '') {
    costIssues.push('Source shipping is unknown (blank); enter 0 only if it is truly free');
  }
  const packaging = take(p.packaging, 'money', 'Packaging', costIssues) ?? new D(0);
  const other = take(p.otherVariable, 'money', 'Other variable cost', costIssues) ?? new D(0);
  const promoPct = take(p.promoPercent, 'percent', 'Promoted listing rate', costIssues) ?? new D(0);
  const ownFeePct = take(p.feePercent, 'percent', 'Fee percent', costIssues);
  const ownFeeFixed = take(p.feeFixed, 'money', 'Fixed fee', costIssues);
  const units = take(p.monthlyUnits, 'units', 'Monthly units', costIssues);
  const salePrice = take(p.salePrice, 'money', 'Sale price', priceIssues);
  const competitor = take(p.competitorPrice, 'money', 'Competitor price', priceIssues);

  for (const msg of sp.issues) costIssues.push(`Scenario: ${msg}`);

  const feePct = ownFeePct ?? sp.tierPercent;
  const feeFixed = ownFeeFixed ?? sp.tierFixed;

  // Overhead allocation (never silently zero).
  let overheadPerUnit: Dec | null = null;
  if (s.allocation === 'none') {
    overheadPerUnit = new D(0);
    if (sp.overhead.gt(0)) {
      warnings.push(
        'Monthly overhead is NOT allocated to this row; projected profit is overstated.',
      );
    }
  } else if (units === null) {
    if (p.monthlyUnits.trim() === '') {
      costIssues.push('Monthly units are required to allocate overhead');
    }
  } else if (s.allocation === 'per_unit_pool') {
    if (pool.totalUnits.lte(0))
      costIssues.push('Total monthly units is 0; cannot allocate overhead');
    else overheadPerUnit = roundCents(sp.overhead.div(pool.totalUnits));
  } else {
    if (units.lte(0) || pool.unitProducts === 0) {
      costIssues.push('Monthly units must be greater than 0 for equal-per-product allocation');
    } else {
      overheadPerUnit = roundCents(sp.overhead.div(pool.unitProducts).div(units));
    }
  }

  const landed = source !== null && shipping !== null ? source.plus(shipping) : null;
  const otherCosts =
    source !== null && shipping !== null && overheadPerUnit !== null
      ? landed!.plus(packaging).plus(other).plus(overheadPerUnit)
      : null;

  // Price: entered, or optional markup-retention rule.
  let price: Dec | null = null;
  let priceSource: RowResult['priceSource'] = null;
  let equation: string | null = null;
  let undercut: Dec | null = null;
  if (s.pricingMode === 'markup_retention') {
    if (competitor !== null && landed !== null) {
      const r = sp.retention.div(100);
      price = roundCents(landed.plus(r.times(competitor.minus(landed))));
      priceSource = 'markup_rule';
      undercut = competitor.minus(price);
      equation =
        `price = landed + retention × (competitor − landed) = ` +
        `${fmt(landed)} + ${r.toFixed(4)} × (${fmt(competitor)} − ${fmt(landed)}) = ${fmt(price)}; ` +
        `undercut vs competitor = ${fmt(competitor)} − ${fmt(price)} = ${fmt(undercut)}`;
      if (competitor.lte(landed)) {
        warnings.push(
          'Competitor price does not exceed your landed cost; the rule prices at or below cost.',
        );
      }
    } else if (salePrice !== null) {
      price = salePrice;
      priceSource = 'entered';
      warnings.push(
        competitor === null
          ? 'No competitor price: used the entered sale price instead of the markup rule.'
          : 'Landed cost unknown: used the entered sale price instead of the markup rule.',
      );
    } else {
      priceIssues.push('No competitor price or sale price to price this row');
    }
  } else if (salePrice !== null) {
    price = salePrice;
    priceSource = 'entered';
  } else if (p.salePrice.trim() === '') {
    priceIssues.push('Sale price is missing');
  }
  if (price !== null && price.lte(0)) {
    priceIssues.push('Price must be greater than 0');
    price = null;
  }

  issues.push(...costIssues, ...priceIssues);

  const breakEven =
    costIssues.length === 0 && otherCosts !== null
      ? findBreakEven(feePct, feeFixed, promoPct, otherCosts)
      : null;

  const hasAssumed = p.costBasis === 'assumed' || p.priceBasis === 'assumed';
  if (hasAssumed) warnings.push('Includes assumed (not observed) inputs.');

  const base: RowResult = {
    id: p.id,
    name: p.name,
    gate: 'incomplete',
    issues,
    warnings,
    price: price ? fmt(price) : null,
    priceSource,
    landedCost: landed ? fmt(landed) : null,
    fee: null,
    promo: null,
    otherCosts: otherCosts ? fmt(otherCosts) : null,
    overheadPerUnit: overheadPerUnit ? fmt(overheadPerUnit) : null,
    net: null,
    marginPercent: null,
    breakEven,
    hasAssumed,
    equation,
    undercut: undercut ? fmt(undercut) : null,
    monthlyNet: null,
    rank: null,
    feePercentUsed: feePct.toString(),
    feeFixedUsed: feeFixed.toFixed(2),
  };

  if (issues.length > 0 || price === null || otherCosts === null) return base;

  const fee = feeAt(price, feePct, feeFixed);
  const promo = promoAt(price, promoPct);
  const net = price.minus(fee).minus(promo).minus(otherCosts);
  const marginPct = net.div(price).times(100);
  const okProfit = net.gte(sp.minNet);
  // exact comparison, no rounding: net >= minMargin% × price
  const okMargin = net.gte(price.times(sp.minMargin).div(100));
  const gate: Gate =
    okProfit && okMargin
      ? 'qualifies'
      : okProfit
        ? 'fails_margin'
        : okMargin
          ? 'fails_profit'
          : 'fails_both';

  if (!okMargin && marginPct.toDecimalPlaces(2).gte(sp.minMargin)) {
    warnings.push(
      `Margin displays as ${marginPct.toDecimalPlaces(2).toFixed(2)}% but the exact value is below the ` +
        `required ${sp.minMargin.toString()}%, so the margin gate fails (gates compare unrounded values).`,
    );
  }
  if (units === null) {
    warnings.push('Monthly units are blank: this row is left out of the projected monthly total.');
  }

  return {
    ...base,
    gate,
    fee: fmt(fee),
    promo: fmt(promo),
    net: fmt(net),
    marginPercent: marginPct.toDecimalPlaces(2).toFixed(2),
    monthlyNet: units !== null ? fmt(net.times(units)) : null,
  };
}

export function computeAll(
  products: Product[],
  scenario: Scenario,
): { rows: RowResult[]; summary: Summary } {
  const sp = scenarioParams(scenario);
  const pool = buildPool(products);
  const rows = products.map((p) => computeRow(p, scenario, sp, pool));

  // Rank exists ONLY for rows that pass every gate.
  const qualifying = rows
    .filter((r) => r.gate === 'qualifies')
    .sort((a, b) => {
      const byNet = new D(b.net!).comparedTo(new D(a.net!));
      if (byNet !== 0) return byNet;
      const byMargin = new D(b.marginPercent!).comparedTo(new D(a.marginPercent!));
      if (byMargin !== 0) return byMargin;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  qualifying.forEach((r, i) => {
    r.rank = i + 1;
  });

  let monthly = new D(0);
  for (const r of qualifying) if (r.monthlyNet !== null) monthly = monthly.plus(r.monthlyNet);

  const summary: Summary = {
    rows: rows.length,
    qualifying: qualifying.length,
    failing: rows.filter((r) => r.gate.startsWith('fails_')).length,
    incomplete: rows.filter((r) => r.gate === 'incomplete').length,
    monthlyNetQualifying: fmt(monthly),
    unallocatedOverhead:
      scenario.allocation === 'none' && sp.overhead.gt(0) ? fmt(sp.overhead) : null,
    scenarioIssues: sp.issues,
  };
  return { rows, summary };
}

export const GATE_LABEL: Record<Gate, string> = {
  qualifies: 'Qualifies',
  fails_profit: 'Fails profit gate',
  fails_margin: 'Fails margin gate',
  fails_both: 'Fails both gates',
  incomplete: 'Incomplete',
};
