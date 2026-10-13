import { FEE_TIERS } from '../domain/feeTiers';
import { readField } from '../domain/numbers';
import type { AllocationMethod, FeeTierId, PricingMode, Scenario } from '../domain/types';

interface Props {
  scenario: Scenario;
  onChange: (patch: Partial<Scenario>) => void;
}

function bad(raw: string, kind: 'money' | 'percent'): boolean {
  return readField(raw, kind).kind !== 'ok';
}

export function ScenarioPanel({ scenario: s, onChange }: Props) {
  return (
    <section className="panel" aria-labelledby="scn-h">
      <h2 id="scn-h">Scenario settings: {s.name}</h2>
      <div className="grid-fields">
        <fieldset>
          <legend>How is the sale price chosen?</legend>
          <label className="radio">
            <input
              type="radio"
              name="pricing"
              checked={s.pricingMode === 'entered'}
              onChange={() => onChange({ pricingMode: 'entered' as PricingMode })}
            />
            Use the entered sale price
          </label>
          <label className="radio">
            <input
              type="radio"
              name="pricing"
              checked={s.pricingMode === 'markup_retention'}
              onChange={() => onChange({ pricingMode: 'markup_retention' as PricingMode })}
            />
            Markup-retention rule (optional)
          </label>
        </fieldset>

        <label className="field">
          <span>Markup retained (%)</span>
          <input
            inputMode="decimal"
            value={s.retentionPercent}
            disabled={s.pricingMode !== 'markup_retention'}
            aria-invalid={bad(s.retentionPercent, 'percent')}
            onChange={(e) => onChange({ retentionPercent: e.target.value })}
          />
          <small>
            price = landed cost + retained% × (competitor − landed cost). Default 90, so you sit
            slightly under the competitor.
          </small>
        </label>

        <label className="field">
          <span>Marketplace fee tier</span>
          <select
            value={s.feeTier}
            onChange={(e) => onChange({ feeTier: e.target.value as FeeTierId })}
          >
            {Object.entries(FEE_TIERS).map(([id, t]) => (
              <option key={id} value={id}>
                {t.label}
              </option>
            ))}
            <option value="custom">Custom (enter below)</option>
          </select>
          <small>Illustrative example tiers, not an official fee schedule.</small>
        </label>

        {s.feeTier === 'custom' && (
          <>
            <label className="field">
              <span>Custom fee (% of price)</span>
              <input
                inputMode="decimal"
                value={s.customFeePercent}
                aria-invalid={bad(s.customFeePercent, 'percent')}
                onChange={(e) => onChange({ customFeePercent: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Custom fixed fee ($)</span>
              <input
                inputMode="decimal"
                value={s.customFeeFixed}
                aria-invalid={bad(s.customFeeFixed, 'money')}
                onChange={(e) => onChange({ customFeeFixed: e.target.value })}
              />
            </label>
          </>
        )}

        <label className="field">
          <span>Monthly storage / fixed overhead ($)</span>
          <input
            inputMode="decimal"
            value={s.monthlyOverhead}
            aria-invalid={bad(s.monthlyOverhead, 'money')}
            onChange={(e) => onChange({ monthlyOverhead: e.target.value })}
          />
          <small>Default $30.00 per month from the source model.</small>
        </label>

        <label className="field">
          <span>Overhead allocation method</span>
          <select
            value={s.allocation}
            onChange={(e) => onChange({ allocation: e.target.value as AllocationMethod })}
          >
            <option value="per_unit_pool">Pool: spread over all units</option>
            <option value="equal_per_product">Equal share per product</option>
            <option value="none">None (overstates profit)</option>
          </select>
        </label>

        <label className="field">
          <span>Minimum net profit per unit ($)</span>
          <input
            inputMode="decimal"
            value={s.minNetProfit}
            aria-invalid={bad(s.minNetProfit, 'money')}
            onChange={(e) => onChange({ minNetProfit: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Minimum net margin (%)</span>
          <input
            inputMode="decimal"
            value={s.minMarginPercent}
            aria-invalid={bad(s.minMarginPercent, 'percent')}
            onChange={(e) => onChange({ minMarginPercent: e.target.value })}
          />
        </label>
      </div>
    </section>
  );
}
