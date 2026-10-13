import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeAll } from './domain/calc';
import { SAMPLE_NOTICE, blankProduct, sampleProducts } from './domain/sample';
import { STORAGE_KEY, emptyState, loadState, saveState } from './domain/storage';
import type { AppState, Product, Scenario } from './domain/types';
import { newId, safeStorage } from './util';
import { ProductsView } from './components/ProductsView';
import { ScenariosView } from './components/ScenariosView';
import { ImportExportView } from './components/ImportExportView';
import { MethodView } from './components/MethodView';

type Tab = 'products' | 'scenarios' | 'import' | 'method';
const TABS: { id: Tab; label: string }[] = [
  { id: 'products', label: 'Products' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'import', label: 'Import / Export' },
  { id: 'method', label: 'Method & limits' },
];

export function App() {
  const store = useMemo(() => safeStorage(), []);
  const [initial] = useState(() => loadState(store, newId));
  const [state, setStateRaw] = useState<AppState>(initial.state);
  const [notice, setNotice] = useState<string | null>(initial.notice);
  const [locked, setLocked] = useState(initial.readOnlyUntilReset);
  const [saveFailed, setSaveFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('products');
  const [status, setStatus] = useState('');
  const stateRef = useRef(state);
  const lockedRef = useRef(locked);

  /** Single write path: update state, then persist (unless saved data from a newer version is protected). */
  const setState = useCallback(
    (fn: (s: AppState) => AppState) => {
      const next = fn(stateRef.current);
      stateRef.current = next;
      setStateRaw(next);
      if (!lockedRef.current) setSaveFailed(!saveState(store, next));
    },
    [store],
  );

  const scenario: Scenario = useMemo(
    () => state.scenarios.find((s) => s.id === state.activeScenarioId) ?? state.scenarios[0]!,
    [state],
  );
  const computed = useMemo(() => computeAll(state.products, scenario), [state.products, scenario]);
  const hasSynthetic = state.products.some((p) => p.synthetic);

  const announce = useCallback((m: string) => setStatus(m), []);

  // Another tab wrote the workspace: this tab would silently overwrite it on its next edit.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        setNotice(
          'This workspace was changed in another tab. Reload this page to see those changes; ' +
            'editing here first will overwrite them.',
        );
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setProducts = useCallback(
    (fn: (p: Product[]) => Product[]) => setState((s) => ({ ...s, products: fn(s.products) })),
    [setState],
  );
  const updateScenario = useCallback(
    (id: string, patch: Partial<Scenario>) =>
      setState((s) => ({
        ...s,
        scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      })),
    [setState],
  );

  const loadSample = () => {
    setProducts((p) => [...p, ...sampleProducts(newId)]);
    announce('Loaded 8 synthetic sample products.');
  };
  const clearSample = () => {
    setProducts((p) => p.filter((x) => !x.synthetic));
    announce('Removed sample products.');
  };
  const addRow = () => {
    setProducts((p) => [...p, blankProduct(newId())]);
    announce('Added a blank product row.');
  };

  const resetAll = () => {
    lockedRef.current = false;
    setLocked(false);
    setState(() => emptyState(newId));
    setNotice(null);
    announce('Workspace reset.');
  };

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◧
          </span>
          <div>
            <p className="brand-name">ProfitLab</p>
            <p className="brand-tag">Marketplace unit economics · projected, never realized</p>
          </div>
        </div>
        <nav aria-label="Sections">
          <ul className="tabs">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="tab"
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="banners">
        {hasSynthetic && (
          <div className="banner banner-sample" role="note">
            <strong>Sample data.</strong> {SAMPLE_NOTICE}{' '}
            <button type="button" className="link" onClick={clearSample}>
              Remove sample rows
            </button>
          </div>
        )}
        {notice && (
          <div className="banner banner-warn" role="alert">
            {notice}{' '}
            {locked ? (
              <button type="button" className="link" onClick={resetAll}>
                Discard saved data and start fresh
              </button>
            ) : (
              <button type="button" className="link" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            )}
          </div>
        )}
        {saveFailed && !locked && (
          <div className="banner banner-warn" role="alert">
            Could not save to browser storage. Use Import / Export to keep a copy of your work.
          </div>
        )}
      </div>

      <main id="main" tabIndex={-1}>
        {tab === 'products' && (
          <ProductsView
            products={state.products}
            scenario={scenario}
            computed={computed}
            setProducts={setProducts}
            updateScenario={updateScenario}
            loadSample={loadSample}
            addRow={addRow}
            announce={announce}
          />
        )}
        {tab === 'scenarios' && (
          <ScenariosView
            state={state}
            setState={setState}
            announce={announce}
            onOpenProducts={() => setTab('products')}
          />
        )}
        {tab === 'import' && (
          <ImportExportView
            state={state}
            scenario={scenario}
            computed={computed}
            setState={setState}
            announce={announce}
            onReset={resetAll}
          />
        )}
        {tab === 'method' && <MethodView />}
      </main>

      <p className="visually-hidden" role="status" aria-live="polite" data-testid="status">
        {status}
      </p>
      <footer className="foot">
        <p>
          Everything runs in your browser; nothing is uploaded. Values are projections from the
          inputs you provide, not realized profit or advice.
        </p>
      </footer>
    </div>
  );
}
