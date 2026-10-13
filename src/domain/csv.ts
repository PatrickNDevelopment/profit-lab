import { readField, type FieldKind, canonicalMoney } from './numbers';
import type { Basis, Product, RowResult, Scenario } from './types';
import { GATE_LABEL } from './calc';

export const MAX_CSV_BYTES = 1_000_000;
export const MAX_CSV_ROWS = 5000;
export const MAX_NAME_LENGTH = 120;

/** Columns of the re-importable inputs CSV, in order. */
export const INPUT_COLUMNS = [
  'name',
  'source_cost',
  'source_shipping',
  'sale_price',
  'competitor_price',
  'fee_percent',
  'fee_fixed',
  'promo_percent',
  'packaging',
  'other_variable',
  'monthly_units',
  'cost_basis',
  'price_basis',
] as const;

/** RFC 4180 parser: quotes, escaped quotes, CRLF/LF, embedded newlines, BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && (r[0] ?? '').trim() === ''));
}

/** Neutralises spreadsheet formula injection in text cells (names). */
export function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
function unguardFormula(text: string): string {
  return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export interface ImportedRow {
  line: number;
  product: Product | null;
  errors: string[];
  warnings: string[];
}

export interface ImportReport {
  fileErrors: string[];
  fileWarnings: string[];
  rows: ImportedRow[];
  validCount: number;
  invalidCount: number;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function importProductsCsv(text: string, newId: () => string): ImportReport {
  const report: ImportReport = {
    fileErrors: [],
    fileWarnings: [],
    rows: [],
    validCount: 0,
    invalidCount: 0,
  };
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
    report.fileErrors.push(`File is larger than ${MAX_CSV_BYTES / 1000} KB.`);
    return report;
  }
  const table = parseCsv(text);
  if (table.length === 0) {
    report.fileErrors.push('The file is empty.');
    return report;
  }
  const header = (table[0] ?? []).map(normalizeHeader);
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    if (!index.has(h)) index.set(h, i);
  });
  const known = new Set<string>(INPUT_COLUMNS);
  for (const h of header) {
    if (h !== '' && !known.has(h)) report.fileWarnings.push(`Unknown column "${h}" was ignored.`);
  }
  for (const required of ['name', 'source_cost']) {
    if (!index.has(required)) report.fileErrors.push(`Missing required column "${required}".`);
  }
  if (!index.has('sale_price') && !index.has('competitor_price')) {
    report.fileErrors.push('Need at least one of the columns "sale_price" or "competitor_price".');
  }
  if (report.fileErrors.length > 0) return report;
  if (table.length - 1 > MAX_CSV_ROWS) {
    report.fileErrors.push(`More than ${MAX_CSV_ROWS} data rows.`);
    return report;
  }

  const seenNames = new Set<string>();
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r] ?? [];
    const get = (col: string): string => {
      const i = index.get(col);
      return i === undefined ? '' : (cells[i] ?? '').trim();
    };
    const errors: string[] = [];
    const warnings: string[] = [];
    if (cells.length > header.length) {
      errors.push(`has ${cells.length} cells but the header has ${header.length}`);
    }
    const check = (col: string, kind: FieldKind, required = false) => {
      const raw = get(col);
      const res = readField(raw, kind);
      if (res.kind === 'error') errors.push(`${col} ${res.message}`);
      else if (res.kind === 'blank' && required) errors.push(`${col} is required`);
      return raw;
    };
    const name = unguardFormula(get('name'));
    if (name === '') errors.push('name is required');
    else if (name.length > MAX_NAME_LENGTH)
      errors.push(`name is longer than ${MAX_NAME_LENGTH} characters`);
    check('source_cost', 'money', true);
    check('source_shipping', 'money');
    check('sale_price', 'money');
    check('competitor_price', 'money');
    check('fee_percent', 'percent');
    check('fee_fixed', 'money');
    check('promo_percent', 'percent');
    check('packaging', 'money');
    check('other_variable', 'money');
    check('monthly_units', 'units');
    if (get('sale_price') === '' && get('competitor_price') === '') {
      errors.push('needs a sale_price or a competitor_price');
    }
    const basisOf = (col: string): Basis => {
      const v = get(col).toLowerCase();
      if (v === '' || v === 'observed') return 'observed';
      if (v === 'assumed') return 'assumed';
      errors.push(`${col} must be "observed" or "assumed"`);
      return 'observed';
    };
    const costBasis = basisOf('cost_basis');
    const priceBasis = basisOf('price_basis');
    if (get('source_shipping') === '' && index.has('source_shipping')) {
      warnings.push('source_shipping is blank: treated as UNKNOWN, row will be incomplete');
    }
    if (name !== '' && seenNames.has(name.toLowerCase())) warnings.push('duplicate product name');
    seenNames.add(name.toLowerCase());

    const money = (col: string): string => {
      const v = readField(get(col), 'money');
      return v.kind === 'ok' ? canonicalMoney(v.value) : get(col);
    };
    const product: Product | null =
      errors.length > 0
        ? null
        : {
            id: newId(),
            name,
            sourceCost: money('source_cost'),
            sourceShipping: money('source_shipping'),
            salePrice: money('sale_price'),
            competitorPrice: money('competitor_price'),
            feePercent: get('fee_percent').replace(/%$/, ''),
            feeFixed: money('fee_fixed'),
            promoPercent: get('promo_percent').replace(/%$/, ''),
            packaging: money('packaging'),
            otherVariable: money('other_variable'),
            monthlyUnits: get('monthly_units'),
            costBasis,
            priceBasis,
            synthetic: false,
          };
    report.rows.push({ line: r + 1, product, errors, warnings });
    if (product) report.validCount += 1;
    else report.invalidCount += 1;
  }
  if (report.rows.length === 0) report.fileErrors.push('The file has a header but no data rows.');
  return report;
}

export function productsToCsv(products: Product[]): string {
  const rows: string[][] = [[...INPUT_COLUMNS]];
  for (const p of products) {
    rows.push([
      guardFormula(p.name),
      p.sourceCost,
      p.sourceShipping,
      p.salePrice,
      p.competitorPrice,
      p.feePercent,
      p.feeFixed,
      p.promoPercent,
      p.packaging,
      p.otherVariable,
      p.monthlyUnits,
      p.costBasis,
      p.priceBasis,
    ]);
  }
  return toCsv(rows);
}

export function resultsToCsv(results: RowResult[], scenario: Scenario): string {
  const header = [
    'name',
    'scenario',
    'pricing_mode',
    'price_source',
    'price',
    'landed_cost',
    'marketplace_fee',
    'promoted_listing_cost',
    'other_costs_incl_overhead',
    'overhead_per_unit',
    'projected_net_profit_per_unit',
    'projected_margin_percent',
    'break_even_price',
    'qualification',
    'rank_among_qualifying',
    'uses_assumed_inputs',
    'issues',
    'projected_or_realized',
  ];
  const rows: string[][] = [header];
  for (const r of results) {
    rows.push([
      guardFormula(r.name),
      guardFormula(scenario.name),
      scenario.pricingMode,
      r.priceSource ?? '',
      r.price ?? '',
      r.landedCost ?? '',
      r.fee ?? '',
      r.promo ?? '',
      r.otherCosts ?? '',
      r.overheadPerUnit ?? '',
      r.net ?? '',
      r.marginPercent ?? '',
      r.breakEven ?? '',
      GATE_LABEL[r.gate],
      r.rank === null ? '' : String(r.rank),
      r.hasAssumed ? 'yes' : 'no',
      guardFormula(r.issues.join('; ')),
      'projected',
    ]);
  }
  return toCsv(rows);
}
