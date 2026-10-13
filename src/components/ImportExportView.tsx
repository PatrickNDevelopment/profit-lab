import { useMemo, useState } from 'react';
import { MAX_CSV_BYTES, importProductsCsv, productsToCsv, resultsToCsv } from '../domain/csv';
import { parseStateJson } from '../domain/storage';
import type { AppState, RowResult, Scenario, Summary } from '../domain/types';
import { download, newId, slug } from '../util';

interface Props {
  state: AppState;
  scenario: Scenario;
  computed: { rows: RowResult[]; summary: Summary };
  setState: (fn: (s: AppState) => AppState) => void;
  announce: (m: string) => void;
  onReset: () => void;
}

const TEMPLATE =
  'name,source_cost,source_shipping,sale_price,competitor_price,fee_percent,fee_fixed,promo_percent,packaging,other_variable,monthly_units,cost_basis,price_basis\n' +
  'Example mug,6.50,3.20,24.99,27.00,,,0,0.60,0,10,observed,observed\n';

export function ImportExportView({
  state,
  scenario,
  computed,
  setState,
  announce,
  onReset,
}: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [fileNote, setFileNote] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [wsError, setWsError] = useState('');
  const [pendingWs, setPendingWs] = useState<AppState | null>(null);

  const report = useMemo(
    () => (text.trim() === '' ? null : importProductsCsv(text, newId)),
    [text],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      setFileNote(`"${file.name}" is larger than ${MAX_CSV_BYTES / 1000} KB and was not loaded.`);
      return;
    }
    setText(await file.text());
    setFileNote(`Loaded "${file.name}". Review the validation below before importing.`);
  };

  const doImport = (validOnly: boolean) => {
    if (!report) return;
    const items = report.rows.flatMap((r) => (r.product ? [r.product] : []));
    if (!validOnly && report.invalidCount > 0) return;
    if (items.length === 0) return;
    setState((s) => ({
      ...s,
      products: mode === 'replace' ? items : [...s.products, ...items],
    }));
    announce(
      `Imported ${items.length} product${items.length === 1 ? '' : 's'}${
        report.invalidCount > 0 ? `; skipped ${report.invalidCount} invalid row(s)` : ''
      }.`,
    );
    setText('');
    setFileNote('');
  };

  const onWorkspaceFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('File too large');
      // Stage the file; replacing the whole workspace needs an explicit confirmation.
      setPendingWs(parseStateJson(await file.text()));
      setWsError('');
    } catch {
      setPendingWs(null);
      setWsError('That file is not a valid ProfitLab workspace export; nothing was changed.');
    }
  };
  const confirmWorkspace = () => {
    if (!pendingWs) return;
    setState(() => pendingWs);
    announce(
      `Workspace replaced: ${pendingWs.products.length} products, ${pendingWs.scenarios.length} scenarios.`,
    );
    setPendingWs(null);
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <>
      <h1>Import &amp; export</h1>

      <section className="panel" aria-labelledby="imp-h">
        <h2 id="imp-h">Import products from CSV</h2>
        <p className="note">
          Required columns: <code>name</code>, <code>source_cost</code>, and at least one of{' '}
          <code>sale_price</code> / <code>competitor_price</code>. A blank{' '}
          <code>source_shipping</code> means <em>unknown</em>, not free. Max 1 MB / 5,000 rows.
        </p>
        <div className="toolbar">
          <label className="inline">
            <span>Choose a CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setText(TEMPLATE);
              setFileNote('Template loaded.');
            }}
          >
            Insert template
          </button>
        </div>
        {fileNote && <p role="status">{fileNote}</p>}
        <label className="field wide">
          <span>…or paste / correct CSV text here</span>
          <textarea
            rows={8}
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            data-testid="csv-text"
          />
        </label>

        {report && (
          <div data-testid="import-report" aria-live="polite">
            {report.fileErrors.length > 0 && (
              <div className="banner banner-warn" role="alert">
                <strong>The file cannot be imported:</strong>
                <ul>
                  {report.fileErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.fileWarnings.length > 0 && (
              <ul className="muted">
                {report.fileWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {report.fileErrors.length === 0 && (
              <>
                <p>
                  <strong data-testid="valid-count">{report.validCount}</strong> valid ·{' '}
                  <strong data-testid="invalid-count">{report.invalidCount}</strong> with errors
                </p>
                <table className="grid">
                  <caption className="visually-hidden">Import validation by line</caption>
                  <thead>
                    <tr>
                      <th scope="col">CSV line</th>
                      <th scope="col">Result</th>
                      <th scope="col">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.line} className={r.product ? '' : 'row-error'}>
                        <th scope="row">{r.line}</th>
                        <td>{r.product ? 'OK' : 'Error'}</td>
                        <td>
                          {[...r.errors, ...r.warnings.map((w) => `note: ${w}`)].join('; ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <fieldset className="inline-fieldset">
                  <legend>When importing</legend>
                  <label className="radio">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'append'}
                      onChange={() => setMode('append')}
                    />
                    Add to existing products
                  </label>
                  <label className="radio">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                    />
                    Replace existing products
                  </label>
                </fieldset>
                <div className="toolbar">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={report.invalidCount > 0 || report.validCount === 0}
                    onClick={() => doImport(false)}
                  >
                    Import all {report.validCount} rows
                  </button>
                  {report.invalidCount > 0 && report.validCount > 0 && (
                    <button type="button" className="btn" onClick={() => doImport(true)}>
                      Import only the {report.validCount} valid rows
                    </button>
                  )}
                </div>
                {report.invalidCount > 0 && (
                  <p className="note">
                    Fix the highlighted lines in the text box above and the report updates
                    immediately.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="exp-h">
        <h2 id="exp-h">Export</h2>
        <div className="toolbar">
          <button
            type="button"
            className="btn primary"
            disabled={state.products.length === 0}
            onClick={() => {
              download(
                `profitlab-results-${slug(scenario.name)}-${stamp}.csv`,
                resultsToCsv(computed.rows, scenario),
                'text/csv',
              );
              announce('Results CSV downloaded.');
            }}
          >
            Download results (CSV) — active scenario
          </button>
          <button
            type="button"
            className="btn"
            disabled={state.products.length === 0}
            onClick={() => {
              download(`profitlab-inputs-${stamp}.csv`, productsToCsv(state.products), 'text/csv');
              announce('Inputs CSV downloaded.');
            }}
          >
            Download inputs (re-importable CSV)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              download(
                `profitlab-workspace-${stamp}.json`,
                JSON.stringify(state, null, 2),
                'application/json',
              );
              announce('Workspace JSON downloaded.');
            }}
          >
            Download workspace (JSON)
          </button>
        </div>
        <p className="note">
          Results are labeled <em>projected</em>. Text cells starting with = + - @ are prefixed with
          an apostrophe so spreadsheets do not execute them.
        </p>
      </section>

      <section className="panel" aria-labelledby="ws-h">
        <h2 id="ws-h">Workspace</h2>
        <label className="inline">
          <span>Load a workspace JSON export</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => void onWorkspaceFile(e.target.files?.[0])}
          />
        </label>
        {wsError && (
          <p className="banner banner-warn" role="alert">
            {wsError}
          </p>
        )}
        {pendingWs && (
          <div className="banner banner-warn" role="alert" data-testid="ws-confirm">
            <p>
              This file holds {pendingWs.products.length} product
              {pendingWs.products.length === 1 ? '' : 's'} and {pendingWs.scenarios.length} scenario
              {pendingWs.scenarios.length === 1 ? '' : 's'}. Loading it <strong>replaces</strong>{' '}
              your current {state.products.length} product{state.products.length === 1 ? '' : 's'}{' '}
              and {state.scenarios.length} scenario{state.scenarios.length === 1 ? '' : 's'}.
            </p>
            <div className="toolbar">
              <button type="button" className="btn danger" onClick={confirmWorkspace}>
                Replace my workspace
              </button>
              <button type="button" className="btn" onClick={() => setPendingWs(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="toolbar">
          {confirmReset ? (
            <>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  onReset();
                  setConfirmReset(false);
                }}
              >
                Yes, erase all products and scenarios
              </button>
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn danger" onClick={() => setConfirmReset(true)}>
              Reset workspace…
            </button>
          )}
        </div>
      </section>
    </>
  );
}
