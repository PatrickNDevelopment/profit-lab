import type { Product, Scenario } from './types';

export const SAMPLE_NOTICE =
  'Synthetic sample data. Names, prices and costs are invented for demonstration and do not reflect any real marketplace listing.';

type Seed = Omit<Product, 'id' | 'synthetic'>;

const base: Seed = {
  name: '',
  sourceCost: '',
  sourceShipping: '',
  salePrice: '',
  competitorPrice: '',
  feePercent: '',
  feeFixed: '',
  promoPercent: '',
  packaging: '',
  otherVariable: '',
  monthlyUnits: '',
  costBasis: 'observed',
  priceBasis: 'observed',
};

/** Designed against the default scenario: 60 units → $0.50 overhead per unit. */
const SEEDS: Seed[] = [
  {
    ...base,
    name: 'Sample 1 · Net exactly $5.00 (meets profit gate)',
    sourceCost: '17.00',
    sourceShipping: '2.72',
    salePrice: '30.00',
    competitorPrice: '34.00',
    packaging: '0.50',
    monthlyUnits: '10',
  },
  {
    ...base,
    name: 'Sample 2 · Net $4.99, one cent short',
    sourceCost: '17.00',
    sourceShipping: '2.72',
    salePrice: '30.00',
    competitorPrice: '34.00',
    packaging: '0.51',
    monthlyUnits: '10',
  },
  {
    ...base,
    name: 'Sample 3 · Margin exactly 15.00%',
    sourceCost: '24.00',
    sourceShipping: '3.00',
    salePrice: '40.00',
    competitorPrice: '45.00',
    packaging: '0.90',
    monthlyUnits: '5',
  },
  {
    ...base,
    name: 'Sample 4 · High markup but unprofitable',
    sourceCost: '2.00',
    sourceShipping: '12.00',
    salePrice: '14.99',
    competitorPrice: '24.00',
    monthlyUnits: '5',
    costBasis: 'assumed',
  },
  {
    ...base,
    name: 'Sample 5 · Low markup, low-fee channel, profitable',
    sourceCost: '100.00',
    sourceShipping: '0.00',
    salePrice: '125.00',
    competitorPrice: '128.00',
    feePercent: '3.00',
    feeFixed: '0.00',
    monthlyUnits: '10',
  },
  {
    ...base,
    name: 'Sample 6 · Shipping cost unknown',
    sourceCost: '20.00',
    sourceShipping: '',
    salePrice: '45.00',
    competitorPrice: '50.00',
    monthlyUnits: '5',
    costBasis: 'assumed',
  },
  {
    ...base,
    name: 'Sample 7 · Healthy margin',
    sourceCost: '12.00',
    sourceShipping: '3.00',
    salePrice: '39.99',
    competitorPrice: '44.00',
    packaging: '1.00',
    monthlyUnits: '10',
  },
  {
    ...base,
    name: 'Sample 8 · Fee-tier sensitive (promoted at 2%)',
    sourceCost: '17.00',
    sourceShipping: '2.00',
    salePrice: '30.00',
    competitorPrice: '33.00',
    promoPercent: '2.00',
    packaging: '0.50',
    monthlyUnits: '5',
  },
];

export function sampleProducts(newId: () => string): Product[] {
  return SEEDS.map((s) => ({ ...s, id: newId(), synthetic: true }));
}

export function defaultScenario(id: string, name = 'Baseline'): Scenario {
  return {
    id,
    name,
    pricingMode: 'entered',
    retentionPercent: '90',
    feeTier: 'standard',
    customFeePercent: '13.25',
    customFeeFixed: '0.30',
    monthlyOverhead: '30.00',
    allocation: 'per_unit_pool',
    minNetProfit: '5.00',
    minMarginPercent: '15',
  };
}

export function blankProduct(id: string): Product {
  return { ...base, id, synthetic: false, name: 'New product' };
}
