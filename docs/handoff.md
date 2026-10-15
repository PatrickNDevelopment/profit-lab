# Handoff

**State:** v0.1 complete locally on branch `phase/01a-build`; independent acceptance review
run on 2026-10-13, defects fixed (see `docs/test-report.md`). Published on GitHub; demo at https://patrickndevelopment.github.io/profit-lab/.

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
- GitHub Pages workflow has run and deployed successfully (2026-10-15).

## Release blockers before publication

Published; no remaining release blockers. Open items are listed in `docs/known-limitations.md`.

## Next exact step

Maintenance and the follow-ups in `docs/known-limitations.md`.

## Gotchas

- `vite.config.ts` sets `base: '/profit-lab/'`; e2e tests use that prefix.
- Local e2e uses `channel: 'msedge'` (no browser download); CI installs Chromium.
- State is raw text; do not "improve" it by storing parsed numbers.
