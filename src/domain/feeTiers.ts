import type { FeeTierId } from './types';

/**
 * ILLUSTRATIVE tiers only. These are example numbers chosen so the sample data exercises the model;
 * they are NOT any marketplace's published fee schedule. Always verify against the current
 * official schedule and use the Custom tier or per-row overrides.
 */
export const FEE_TIERS: Record<
  Exclude<FeeTierId, 'custom'>,
  { label: string; percent: string; fixed: string }
> = {
  standard: { label: 'Example A · 13.25% + $0.30', percent: '13.25', fixed: '0.30' },
  reduced: { label: 'Example B · 12.35% + $0.30', percent: '12.35', fixed: '0.30' },
  high: { label: 'Example C · 15.00% + $0.40', percent: '15.00', fixed: '0.40' },
};
