# Handoff

**State:** v0.1 complete locally on branch `phase/01a-build`; independent acceptance (Prompt 01B)
not yet run. Not pushed, not deployed.

## Run

```powershell
npm ci
npm run dev          # http://localhost:5173/profit-lab/
npm run verify       # full gate (or scripts/verify.ps1)
```

## What really works

- Product table with all required inputs; sort, filter, bulk edit; add/delete rows.
- Exact-decimal net profit, margin, break-even, gates, ranking (qualifying rows only).
- Optional markup-retention pricing with visible equation and undercut.
- Overhead ($30 default) allocation: pool, equal-per-product, none (flagged).
- Scenarios: duplicate, rename, activate, delete (with confirm), side-by-side compare.
- CSV import with line errors and in-place correction; results CSV, inputs CSV, workspace JSON.
- localStorage persistence with corruption recovery and newer-schema protection.

## What is disabled / absent

- No backend, no live data, no listing/order/fulfillment features (by design).
- GitHub Pages workflow written but never executed.

## Release blockers before publication

1. Run Prompt 01B (independent adversarial acceptance) in a fresh session.
2. Owner decisions: confirm the MIT license and `PatrickNDevelopment` account; approve repo
   creation, push and enabling Pages.
3. Optionally verify CI on a real remote.

## Next exact step

Open a **new** Claude Code session at `C:\Users\patno\Desktop\Github` and paste **Prompt 01B**
from `Claude_GitHub_Portfolio_Build_Chain.md`.

## Gotchas

- `vite.config.ts` sets `base: '/profit-lab/'`; e2e tests use that prefix.
- Local e2e uses `channel: 'msedge'` (no browser download); CI installs Chromium.
- State is raw text; do not "improve" it by storing parsed numbers.
