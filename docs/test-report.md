# Test report

Environment: Windows 10, Node.js v24.20.0, npm 11.19.0, Microsoft Edge (Chromium) via Playwright
1.64.0. Date: 2026-10-13. Command: `scripts/verify.ps1` (which first runs `npm ci` from the
lockfile). Overall exit code: **0**.

| #   | Command                | Result                                                                       |
| --- | ---------------------- | ---------------------------------------------------------------------------- |
| 1   | `npm ci`               | exit 0, 0 vulnerabilities reported                                           |
| 2   | `npm run format:check` | exit 0, all files match Prettier                                             |
| 3   | `npm run lint`         | exit 0, no ESLint findings                                                   |
| 4   | `npm run typecheck`    | exit 0 (`tsc --noEmit`, strict)                                              |
| 5   | `npm test`             | exit 0, **45 tests / 3 files passed**                                        |
| 6   | `npm run build`        | exit 0, production bundle built                                              |
| 7   | `npm run secrets`      | exit 0, `secret-scan: no findings`                                           |
| 8   | `npm run e2e`          | exit 0, **6 tests passed** against the production build under `/profit-lab/` |

## Clean-clone check

The committed branch `phase/01a-build` was cloned into a fresh temp directory and
`scripts/verify.ps1` run there: exit 0, 45 unit tests and 6 browser tests passed. This confirms the
commit contains everything needed (no reliance on untracked files).

## Unit / domain tests (Vitest)

- `tests/calc.test.ts`: exact arithmetic, the eight designed boundary rows (net exactly $5.00,
  $4.99, margin exactly 15.00%, high-markup-unprofitable, low-markup-low-fee, unknown shipping),
  deterministic scenario changes, allocation methods, markup-retention equation and undercut,
  validation failures, break-even.
- `tests/reference-model.test.ts`: independent BigInt integer-cents oracle. **600 randomized
  scenarios** (net, gate, rank), **300 break-even cases**, and **100 negative-markup / missing-cost
  cases** that must never qualify.
- `tests/csv-storage.test.ts`: RFC 4180 parsing, row-level import errors with line numbers,
  corrected re-import, required-column errors, size cap, formula-injection guard, input CSV
  round-trip, persistence round-trip, corrupt data recovery, newer-schema protection, throwing
  storage.

## Browser tests (Playwright)

1. Journey 1: sample data → fee tier change flips rows → restored exactly → allocation "none"
   warning → Explain panel.
2. Journey 2: CSV with invalid row → line error → disabled import → correct → import → duplicate
   scenario → markup rule equation → compare → results CSV download contents.
3. Reload persistence and corrupt-storage recovery alert.
4. Invalid numeric input flagged and row incomplete.
5. Every form control has an accessible name; no horizontal page overflow at 375 px.
6. Screenshot capture (desktop and mobile).

## Screenshots inspected

`docs/screenshots/desktop-products.png`, `mobile-products.png`, `desktop-scenarios.png`.
Defects found by inspection and fixed: negative amounts rendered `$-1.80`; product name scrolled
out of view; results hidden off-screen to the right; selects overflowing their cards; truncated
fee-tier label.

## Defects found during test authoring

- Two e2e expectations of mine were wrong (more rows flip at the high fee tier than first
  predicted). The application was correct; the expectations were recomputed by hand and
  tightened to pin specific rows.

## Not tested

- Firefox and Safari; screen-reader and 200%-zoom audits; real marketplace data (none used);
  the GitHub Actions workflows have never run (no remote exists).
- The 250+ scenario property suite is seeded randomized, not a shrinking property-testing library.
