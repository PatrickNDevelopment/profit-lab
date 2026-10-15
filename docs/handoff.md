# Handoff

**State:** v0.1 complete locally on branch `phase/01a-build`; independent acceptance review
run on 2026-10-13, defects fixed (see `docs/test-report.md`). Not pushed, not deployed.

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

1. Owner approval to create the public repo, push, and enable Pages (MIT and the
   `PatrickNDevelopment` account are already confirmed, decision D-005).
2. Verify the CI and Pages workflows on a real remote (never executed locally).
3. Human publication review of README wording and screenshots.

## Next exact step

Human publication review, then (with explicit approval) create the repository and push.

## Gotchas

- `vite.config.ts` sets `base: '/profit-lab/'`; e2e tests use that prefix.
- Local e2e uses `channel: 'msedge'` (no browser download); CI installs Chromium.
- State is raw text; do not "improve" it by storing parsed numbers.
