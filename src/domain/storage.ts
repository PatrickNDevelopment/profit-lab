import { z } from 'zod';
import type { AppState } from './types';
import { defaultScenario } from './sample';

export const STORAGE_KEY = 'profitlab.state';
export const BACKUP_KEY = 'profitlab.state.unreadable-backup';

const text = z.string().max(2000);
const basis = z.enum(['observed', 'assumed']);

const productSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(500),
  sourceCost: text,
  sourceShipping: text,
  salePrice: text,
  competitorPrice: text,
  feePercent: text,
  feeFixed: text,
  promoPercent: text,
  packaging: text,
  otherVariable: text,
  monthlyUnits: text,
  costBasis: basis,
  priceBasis: basis,
  synthetic: z.boolean(),
});

const scenarioSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  pricingMode: z.enum(['entered', 'markup_retention']),
  retentionPercent: text,
  feeTier: z.enum(['standard', 'reduced', 'high', 'custom']),
  customFeePercent: text,
  customFeeFixed: text,
  monthlyOverhead: text,
  allocation: z.enum(['per_unit_pool', 'equal_per_product', 'none']),
  minNetProfit: text,
  minMarginPercent: text,
});

export const stateSchema = z.object({
  schemaVersion: z.literal(1),
  products: z.array(productSchema).max(5000),
  scenarios: z.array(scenarioSchema).min(1).max(50),
  activeScenarioId: z.string(),
});

export function emptyState(newId: () => string): AppState {
  const s = defaultScenario(newId());
  return { schemaVersion: 1, products: [], scenarios: [s], activeScenarioId: s.id };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LoadResult {
  state: AppState;
  /** human-readable note when stored data could not be used */
  notice: string | null;
  /** when true, saving would destroy data we could not read: callers must not auto-save until user acts */
  readOnlyUntilReset: boolean;
}

export function loadState(store: KeyValueStore | null, newId: () => string): LoadResult {
  if (!store) return { state: emptyState(newId), notice: null, readOnlyUntilReset: false };
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return {
      state: emptyState(newId),
      notice: 'Browser storage is unavailable; your work will not persist after closing this tab.',
      readOnlyUntilReset: false,
    };
  }
  if (raw === null) return { state: emptyState(newId), notice: null, readOnlyUntilReset: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    const version = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
    if (typeof version === 'number' && version > 1) {
      return {
        state: emptyState(newId),
        notice: `Saved data was written by a newer version (schema ${version}). It was left untouched; export it from that version before resetting.`,
        readOnlyUntilReset: true,
      };
    }
    const state = stateSchema.parse(parsed);
    const activeOk = state.scenarios.some((s) => s.id === state.activeScenarioId);
    return {
      state: {
        ...state,
        activeScenarioId: activeOk ? state.activeScenarioId : (state.scenarios[0]?.id ?? ''),
      },
      notice: null,
      readOnlyUntilReset: false,
    };
  } catch {
    try {
      store.setItem(BACKUP_KEY, raw);
    } catch {
      /* ignore */
    }
    return {
      state: emptyState(newId),
      notice:
        'Saved data was unreadable and could not be loaded. A backup copy was kept in browser storage; starting fresh.',
      readOnlyUntilReset: false,
    };
  }
}

export function saveState(store: KeyValueStore | null, state: AppState): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Reads a user-supplied scenario/state JSON file safely. */
export function parseStateJson(textInput: string): AppState {
  if (textInput.length > 5_000_000) throw new Error('File too large');
  return stateSchema.parse(JSON.parse(textInput));
}
