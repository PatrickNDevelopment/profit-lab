import { useMemo, useState } from 'react';
import { GATE_LABEL } from '../domain/calc';
import { readField, type FieldKind } from '../domain/numbers';
import type { Basis, Gate, Product, RowResult, Scenario, Summary } from '../domain/types';
import { usd } from '../util';
import { ScenarioPanel } from './ScenarioPanel';

interface Props {
  products: Product[];
  scenario: Scenario;
  computed: { rows: RowResult[]; summary: Summary };
  setProducts: (fn: (p: Product[]) => Product[]) => void;
  updateScenario: (id: string, patch: Partial<Scenario>) => void;
  loadSample: () => void;
  addRow: () => void;
  announce: (m: string) => void;
}

type TextField =
  | 'sourceCost'
  | 'sourceShipping'
  | 'salePrice'
  | 'competitorPrice'
  | 'feePercent'
  | 'feeFixed'
  | 'promoPercent'
  | 'packaging'
  | 'otherVariable'
  | 'monthlyUnits';

const INPUT_COLS: { key: TextField; label: string; kind: FieldKind; hint?: string }[] = [
  { key: 'sourceCost', label: 'Source cost', kind: 'money' },
  { key: 'sourceShipping', label: 'Source shipping', kind: 'money', hint: 'blank = unknown' },
  { key: 'salePrice', label: 'Sale price', kind: 'money' },
  { key: 'competitorPrice', label: 'Competitor price', kind: 'money' },
  { key: 'feePercent', label: 'Fee %', kind: 'percent', hint: 'blank = tier' },
  { key: 'feeFixed', label: 'Fixed fee', kind: 'money', hint: 'blank = tier' },
  { key: 'promoPercent', label: 'Promoted %', kind: 'percent' },
  { key: 'packaging', label: 'Packaging', kind: 'money' },
  { key: 'otherVariable', label: 'Other variable', kind: 'money' },
  { key: 'monthlyUnits', label: 'Units / month', kind: 'units' },
];

type SortKey = 'order' | 'name' | 'price' | 'net' | 'margin' | 'breakEven' | 'gate' | 'rank';
const GATE_ORDER: Gate[] = [
  'qualifies',
  'fails_margin',
  'fails_profit',
  'fails_both',
  'incomplete',
];

function num(s: string | null): number {
  if (s === null || s === 'unattainable') return Number.POSITIVE_INFINITY;
  return Number(s);
}

export function ProductsView({
  products,
  scenario,
  computed,
  setProducts,
  updateScenario,
  loadSample,
  addRow,
  announce,
}: Props) {
  const [filter, setFilter] = useState('');
  const [gateFilter, setGateFilter] = useState<'all' | Gate>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 });
  const [explainId, setExplainId] = useState<string | null>(null);
  const [bulkField, setBulkField] = useState<TextField | 'costBasis' | 'priceBasis'>('packaging');
  const [bulkValue, setBulkValue] = useState('');
  const { rows, summary } = computed;

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = products
      .map((p, order) => ({ p, r: byId.get(p.id)!, order }))
      .filter(
        ({ p, r }) =>
          (q === '' || p.name.toLowerCase().includes(q)) &&
          (gateFilter === 'all' || r.gate === gateFilter),
      );
    const val = (x: (typeof list)[number]): number | string => {
      switch (sort.key) {
        case 'name':
          return x.p.name.toLowerCase();
        case 'price':
          return num(x.r.price);
        case 'net':
          return x.r.net === null ? Number.NEGATIVE_INFINITY : Number(x.r.net);
        case 'margin':
          return x.r.marginPercent === null ? Number.NEGATIVE_INFINITY : Number(x.r.marginPercent);
        case 'breakEven':
          return num(x.r.breakEven);
        case 'gate':
          return GATE_ORDER.indexOf(x.r.gate);
        case 'rank':
          return x.r.rank ?? Number.POSITIVE_INFINITY;
        default:
          return x.order;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return (c || a.order - b.order) * (sort.key === 'order' ? 1 : sort.dir);
    });
  }, [products, byId, filter, gateFilter, sort]);

  const edit = (id: string, patch: Partial<Product>) =>
    setProducts((all) =>
      all.map((p) => (p.id === id ? { ...p, ...patch, synthetic: p.synthetic } : p)),
    );

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' =>
    sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none';
  const sortHead = (k: SortKey, label: string) => (
    <th scope="col" aria-sort={ariaSort(k)}>
      <button type="button" className="th-btn" onClick={() => sortBy(k)}>
        {label}
        <span aria-hidden="true">{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  );

  const applyBulk = () => {
    const ids = new Set(visible.map((v) => v.p.id));
    if (ids.size === 0) {
      announce('No visible rows to change.');
      return;
    }
    if (bulkField === 'costBasis' || bulkField === 'priceBasis') {
      if (bulkValue !== 'observed' && bulkValue !== 'assumed') {
        announce('Choose observed or assumed first.');
        return;
      }
      setProducts((all) =>
        all.map((p) => (ids.has(p.id) ? { ...p, [bulkField]: bulkValue as Basis } : p)),
      );
    } else {
      const kind = INPUT_COLS.find((c) => c.key === bulkField)!.kind;
      const r = readField(bulkValue, kind);
      if (r.kind === 'error') {
        announce(`Value ${r.message}; nothing changed.`);
        return;
      }
      setProducts((all) =>
        all.map((p) => (ids.has(p.id) ? { ...p, [bulkField]: bulkValue.trim() } : p)),
      );
    }
    announce(`Updated ${ids.size} visible row${ids.size === 1 ? '' : 's'}.`);
  };

  const remove = (id: string) => {
    setProducts((all) => all.filter((p) => p.id !== id));
    if (explainId === id) setExplainId(null);
    announce('Row deleted.');
  };

  const explained = explainId ? byId.get(explainId) : undefined;
  const bulkIsBasis = bulkField === 'costBasis' || bulkField === 'priceBasis';

  return (
    <>
      <h1>Products &amp; projected profit</h1>

      <section className="cards" aria-label="Summary">
        <div className="card">
          <p className="card-n" data-testid="count-qualifying">
            {summary.qualifying}
          </p>
          <p>qualify</p>
        </div>
        <div className="card">
          <p className="card-n" data-testid="count-failing">
            {summary.failing}
          </p>
          <p>fail a gate</p>
        </div>
        <div className="card">
          <p className="card-n" data-testid="count-incomplete">
            {summary.incomplete}
          </p>
          <p>incomplete</p>
        </div>
        <div className="card">
          <p className="card-n" data-testid="monthly-net">
            {usd(summary.monthlyNetQualifying)}
          </p>
          <p>projected monthly net, qualifying rows only (not realized)</p>
        </div>
      </section>

      {summary.unallocatedOverhead && (
        <p className="banner banner-warn" role="note">
          ${summary.unallocatedOverhead}/month of fixed overhead is <strong>not allocated</strong>;
          projected profit below is overstated.
        </p>
      )}
      {summary.scenarioIssues.length > 0 && (
        <div className="banner banner-warn" role="alert">
          Scenario settings need attention: {summary.scenarioIssues.join('; ')}.
        </div>
      )}

      <ScenarioPanel scenario={scenario} onChange={(patch) => updateScenario(scenario.id, patch)} />

      <section className="panel" aria-labelledby="tbl-h">
        <h2 id="tbl-h">Product table</h2>
        <div className="toolbar">
          <button type="button" className="btn primary" onClick={addRow}>
            Add product
          </button>
          <button type="button" className="btn" onClick={loadSample}>
            Load sample data
          </button>
          <label className="inline">
            <span>Search name</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <label className="inline">
            <span>Show</span>
            <select
              value={gateFilter}
              onChange={(e) => setGateFilter(e.target.value as 'all' | Gate)}
            >
              <option value="all">All rows</option>
              {GATE_ORDER.map((g) => (
                <option key={g} value={g}>
                  {GATE_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <details className="bulk">
          <summary>Bulk edit visible rows ({visible.length})</summary>
          <div className="toolbar">
            <label className="inline">
              <span>Field</span>
              <select
                value={bulkField}
                onChange={(e) => {
                  setBulkField(e.target.value as TextField | 'costBasis' | 'priceBasis');
                  setBulkValue('');
                }}
              >
                {INPUT_COLS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
                <option value="costBasis">Cost basis</option>
                <option value="priceBasis">Price basis</option>
              </select>
            </label>
            <label className="inline">
              <span>New value</span>
              {bulkIsBasis ? (
                <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                  <option value="">Choose…</option>
                  <option value="observed">observed</option>
                  <option value="assumed">assumed</option>
                </select>
              ) : (
                <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
              )}
            </label>
            <button type="button" className="btn" onClick={applyBulk}>
              Apply to visible rows
            </button>
          </div>
        </details>

        {products.length === 0 ? (
          <div className="empty">
            <p>No products yet.</p>
            <p>
              Add a row, import a CSV, or load the labeled synthetic sample data to see how the
              gates work.
            </p>
          </div>
        ) : (
          <div
            className="table-wrap"
            role="region"
            aria-label="Product table, scrollable"
            tabIndex={0}
          >
            <table className="grid">
              <caption className="visually-hidden">
                Editable product inputs followed by projected results for the active scenario.
              </caption>
              <thead>
                <tr>
                  {sortHead('name', 'Product')}
                  {sortHead('gate', 'Status')}
                  {sortHead('net', 'Projected net / unit')}
                  {sortHead('margin', 'Margin %')}
                  {sortHead('price', 'Price used')}
                  {sortHead('breakEven', 'Break-even price')}
                  {sortHead('rank', 'Rank')}
                  {INPUT_COLS.map((c) => (
                    <th scope="col" key={c.key}>
                      {c.label}
                      {c.hint && <small className="hint">{c.hint}</small>}
                    </th>
                  ))}
                  <th scope="col">Cost basis</th>
                  <th scope="col">Price basis</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ p, r }) => (
                  <tr key={p.id} data-name={p.name} className={`gate-${r.gate}`}>
                    <th scope="row">
                      <input
                        className="name-in"
                        aria-label={`Product name, row ${p.name}`}
                        title={p.name}
                        value={p.name}
                        maxLength={120}
                        onChange={(e) => edit(p.id, { name: e.target.value })}
                      />
                      {p.synthetic && <span className="chip">sample</span>}
                    </th>
                    <td>
                      <span className={`badge badge-${r.gate}`} data-testid="gate">
                        {GATE_LABEL[r.gate]}
                      </span>
                      {r.hasAssumed && <span className="chip chip-assumed">assumed inputs</span>}
                    </td>
                    <td className="num" data-testid="net">
                      {usd(r.net)}
                    </td>
                    <td className="num">
                      {r.marginPercent === null ? '—' : `${r.marginPercent}%`}
                    </td>
                    <td className="num">
                      {usd(r.price)}
                      {r.priceSource === 'markup_rule' && <small className="hint">rule</small>}
                    </td>
                    <td className="num">
                      {r.breakEven === null
                        ? '—'
                        : r.breakEven === 'unattainable'
                          ? 'unattainable'
                          : `$${r.breakEven}`}
                    </td>
                    <td className="num">{r.rank ?? '—'}</td>
                    {INPUT_COLS.map((c) => {
                      const invalid = readField(p[c.key], c.kind).kind === 'error';
                      return (
                        <td key={c.key}>
                          <input
                            className="num-in"
                            inputMode="decimal"
                            aria-label={`${c.label} for ${p.name}`}
                            aria-invalid={invalid}
                            value={p[c.key]}
                            onChange={(e) => edit(p.id, { [c.key]: e.target.value })}
                          />
                        </td>
                      );
                    })}
                    <td>
                      <select
                        aria-label={`Cost basis for ${p.name}`}
                        value={p.costBasis}
                        onChange={(e) => edit(p.id, { costBasis: e.target.value as Basis })}
                      >
                        <option value="observed">observed</option>
                        <option value="assumed">assumed</option>
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Price basis for ${p.name}`}
                        value={p.priceBasis}
                        onChange={(e) => edit(p.id, { priceBasis: e.target.value as Basis })}
                      >
                        <option value="observed">observed</option>
                        <option value="assumed">assumed</option>
                      </select>
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn small"
                        aria-label={`Explain ${p.name}`}
                        aria-pressed={explainId === p.id}
                        onClick={() => setExplainId(explainId === p.id ? null : p.id)}
                      >
                        Explain
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => remove(p.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && <p className="empty">No rows match the current filter.</p>}
          </div>
        )}
        <p className="note">
          Net profit is <strong>projected</strong> from your inputs. Blank shipping means unknown
          and keeps the row incomplete; it is never treated as free. Rank is given only to rows that
          pass every gate.
        </p>
      </section>

      {explained && (
        <section className="panel" aria-labelledby="exp-h" data-testid="explain">
          <h2 id="exp-h">How “{explained.name}” was calculated</h2>
          {explained.issues.length > 0 && (
            <div className="banner banner-warn" role="note">
              <strong>Cannot qualify yet:</strong>
              <ul>
                {explained.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          {explained.equation && (
            <p className="equation" data-testid="equation">
              {explained.equation}
            </p>
          )}
          <dl className="breakdown">
            <dt>Price used ({explained.priceSource ?? 'none'})</dt>
            <dd>{usd(explained.price)}</dd>
            <dt>Landed source cost (cost + shipping)</dt>
            <dd>{explained.landedCost ? `$${explained.landedCost}` : '—'}</dd>
            <dt>
              Marketplace fee ({explained.feePercentUsed}% + ${explained.feeFixedUsed})
            </dt>
            <dd>{explained.fee ? `$${explained.fee}` : '—'}</dd>
            <dt>Promoted listing cost</dt>
            <dd>{explained.promo ? `$${explained.promo}` : '—'}</dd>
            <dt>Overhead per unit (allocated)</dt>
            <dd>{explained.overheadPerUnit ? `$${explained.overheadPerUnit}` : '—'}</dd>
            <dt>Landed + packaging + other + overhead</dt>
            <dd>{explained.otherCosts ? `$${explained.otherCosts}` : '—'}</dd>
            <dt>Projected net profit per unit</dt>
            <dd>
              <strong>{usd(explained.net)}</strong>
            </dd>
            <dt>Projected monthly net (net × units)</dt>
            <dd>{usd(explained.monthlyNet)}</dd>
          </dl>
          {explained.warnings.length > 0 && (
            <ul>
              {explained.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
