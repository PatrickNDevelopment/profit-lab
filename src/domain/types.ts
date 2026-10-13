export type Basis = 'observed' | 'assumed';

/** Every numeric field is the user's raw text; '' means blank. Parsing happens in calc/numbers. */
export interface Product {
  id: string;
  name: string;
  sourceCost: string;
  sourceShipping: string;
  salePrice: string;
  competitorPrice: string;
  /** blank = inherit the scenario's fee tier */
  feePercent: string;
  feeFixed: string;
  promoPercent: string;
  packaging: string;
  otherVariable: string;
  monthlyUnits: string;
  costBasis: Basis;
  priceBasis: Basis;
  /** true for rows created by "Load sample data" */
  synthetic: boolean;
}

export type PricingMode = 'entered' | 'markup_retention';
export type FeeTierId = 'standard' | 'reduced' | 'high' | 'custom';
export type AllocationMethod = 'per_unit_pool' | 'equal_per_product' | 'none';

export interface Scenario {
  id: string;
  name: string;
  pricingMode: PricingMode;
  /** share of the competitor's markup retained; default 90 */
  retentionPercent: string;
  feeTier: FeeTierId;
  customFeePercent: string;
  customFeeFixed: string;
  /** monthly storage / fixed overhead; default 30.00 */
  monthlyOverhead: string;
  allocation: AllocationMethod;
  minNetProfit: string;
  minMarginPercent: string;
}

export interface AppState {
  schemaVersion: 1;
  products: Product[];
  scenarios: Scenario[];
  activeScenarioId: string;
}

export type Gate = 'qualifies' | 'fails_profit' | 'fails_margin' | 'fails_both' | 'incomplete';

export interface RowResult {
  id: string;
  name: string;
  gate: Gate;
  issues: string[];
  warnings: string[];
  price: string | null;
  priceSource: 'entered' | 'markup_rule' | null;
  landedCost: string | null;
  fee: string | null;
  promo: string | null;
  otherCosts: string | null;
  overheadPerUnit: string | null;
  net: string | null;
  marginPercent: string | null;
  /** lowest cent price with net >= 0, 'unattainable', or null if cost inputs are incomplete */
  breakEven: string | 'unattainable' | null;
  hasAssumed: boolean;
  equation: string | null;
  undercut: string | null;
  monthlyNet: string | null;
  rank: number | null;
  feePercentUsed: string | null;
  feeFixedUsed: string | null;
}

export interface Summary {
  rows: number;
  qualifying: number;
  failing: number;
  incomplete: number;
  monthlyNetQualifying: string;
  unallocatedOverhead: string | null;
  scenarioIssues: string[];
}
