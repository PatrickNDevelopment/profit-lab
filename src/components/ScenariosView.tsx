import { useMemo, useState } from 'react';
import { GATE_LABEL, computeAll } from '../domain/calc';
import { FEE_TIERS } from '../domain/feeTiers';
import type { AppState, Scenario } from '../domain/types';
import { newId, usd } from '../util';

interface Props {
  state: AppState;
  setState: (fn: (s: AppState) => AppState) => void;
  announce: (m: string) => void;
  onOpenProducts: () => void;
}

function describe(s: Scenario): string {
  const tier =
    s.feeTier === 'custom'
      ? `custom ${s.customFeePercent}% + $${s.customFeeFixed}`
      : FEE_TIERS[s.feeTier].label;
  const pricing =
    s.pricingMode === 'markup_retention'
      ? `markup rule (${s.retentionPercent}% retained)`
      : 'entered prices';
  const alloc = {
    per_unit_pool: 'pooled per unit',
    equal_per_product: 'equal per product',
    none: 'unallocated',
  }[s.allocation];
  return `${pricing} · ${tier} · overhead $${s.monthlyOverhead} ${alloc} · gates ≥ $${s.minNetProfit} & ≥ ${s.minMarginPercent}%`;
}

export function ScenariosView({ state, setState, announce, onOpenProducts }: Props) {
  const { scenarios, activeScenarioId } = state;
  const [aId, setA] = useState(scenarios[0]?.id ?? '');
  const [bId, setB] = useState(scenarios[1]?.id ?? scenarios[0]?.id ?? '');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const find = (id: string) => scenarios.find((s) => s.id === id) ?? scenarios[0]!;
  const A = find(aId);
  const B = find(bId);

  const compare = useMemo(() => {
    const ra = computeAll(state.products, A);
    const rb = computeAll(state.products, B);
    const bMap = new Map(rb.rows.map((r) => [r.id, r]));
    return {
      sa: ra.summary,
      sb: rb.summary,
      lines: ra.rows.map((r) => ({ a: r, b: bMap.get(r.id)! })),
    };
  }, [state.products, A, B]);

  const duplicate = (s: Scenario) => {
    const copy: Scenario = { ...s, id: newId(), name: `${s.name} (copy)` };
    setState((st) => ({ ...st, scenarios: [...st.scenarios, copy], activeScenarioId: copy.id }));
    setB(copy.id);
    announce(`Saved scenario "${copy.name}" and made it active.`);
  };
  const rename = (id: string, name: string) =>
    setState((st) => ({
      ...st,
      scenarios: st.scenarios.map((s) => (s.id === id ? { ...s, name } : s)),
    }));
  const remove = (id: string) => {
    setState((st) => {
      const rest = st.scenarios.filter((s) => s.id !== id);
      if (rest.length === 0) return st;
      return {
        ...st,
        scenarios: rest,
        activeScenarioId: st.activeScenarioId === id ? rest[0]!.id : st.activeScenarioId,
      };
    });
    setConfirmDelete(null);
    announce('Scenario deleted.');
  };

  return (
    <>
      <h1>Scenarios &amp; comparison</h1>
      <section className="panel" aria-labelledby="sc-list">
        <h2 id="sc-list">Saved scenarios</h2>
        <p className="note">
          A scenario holds pricing mode, fee tier, overhead, allocation and gate thresholds.
          Products are shared. Edit the active scenario on the Products tab.
        </p>
        <ul className="scenario-list">
          {scenarios.map((s) => (
            <li key={s.id} className={s.id === activeScenarioId ? 'active' : ''}>
              <label className="field">
                <span>Name</span>
                <input
                  value={s.name}
                  maxLength={120}
                  aria-label={`Scenario name ${s.name}`}
                  onChange={(e) => rename(s.id, e.target.value || 'Untitled')}
                />
              </label>
              <p className="muted">{describe(s)}</p>
              <div className="toolbar">
                {s.id === activeScenarioId ? (
                  <span className="chip">active</span>
                ) : (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setState((st) => ({ ...st, activeScenarioId: s.id }));
                      announce(`"${s.name}" is now the active scenario.`);
                    }}
                  >
                    Make active
                  </button>
                )}
                <button type="button" className="btn small" onClick={() => duplicate(s)}>
                  Duplicate
                </button>
                {s.id === activeScenarioId && (
                  <button type="button" className="btn small" onClick={onOpenProducts}>
                    Edit on Products tab
                  </button>
                )}
                {scenarios.length > 1 &&
                  (confirmDelete === s.id ? (
                    <>
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => remove(s.id)}
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => setConfirmDelete(s.id)}
                    >
                      Delete
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="cmp-h">
        <h2 id="cmp-h">Compare two scenarios</h2>
        {scenarios.length < 2 ? (
          <p className="empty">Duplicate the scenario to compare variations side by side.</p>
        ) : (
          <>
            <div className="toolbar">
              <label className="inline">
                <span>Scenario A</span>
                <select value={A.id} onChange={(e) => setA(e.target.value)}>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline">
                <span>Scenario B</span>
                <select value={B.id} onChange={(e) => setB(e.target.value)}>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <table className="grid compare" data-testid="compare">
              <caption className="visually-hidden">Scenario comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">A net / unit</th>
                  <th scope="col">A status</th>
                  <th scope="col">B net / unit</th>
                  <th scope="col">B status</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {compare.lines.map(({ a, b }) => {
                  const changed = a.gate !== b.gate;
                  const delta =
                    a.net !== null && b.net !== null
                      ? (Number(b.net) - Number(a.net)).toFixed(2)
                      : null;
                  return (
                    <tr key={a.id}>
                      <th scope="row">{a.name}</th>
                      <td className="num">{usd(a.net)}</td>
                      <td>{GATE_LABEL[a.gate]}</td>
                      <td className="num">{usd(b.net)}</td>
                      <td>{GATE_LABEL[b.gate]}</td>
                      <td>
                        {changed ? <strong>Status changes · </strong> : null}
                        {delta === null
                          ? 'n/a'
                          : Number(delta) === 0
                            ? 'no change'
                            : Number(delta) > 0
                              ? `+${usd(delta)}`
                              : usd(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Qualifying rows</th>
                  <td colSpan={2}>{compare.sa.qualifying}</td>
                  <td colSpan={3}>{compare.sb.qualifying}</td>
                </tr>
                <tr>
                  <th scope="row">Projected monthly net, qualifying</th>
                  <td colSpan={2}>{usd(compare.sa.monthlyNetQualifying)}</td>
                  <td colSpan={3}>{usd(compare.sb.monthlyNetQualifying)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </section>
    </>
  );
}
