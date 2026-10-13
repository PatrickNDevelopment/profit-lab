# Test report

Independent acceptance review (Prompt 01B), 2026-10-13. Environment: Windows 10, Node.js
v24.20.0, npm 11.19.0, Microsoft Edge (Chromium) via Playwright 1.64.0. Reviewer did not rely on
the builder's claims: the builder's baseline was re-run first, then new adversarial checks were
written and run, defects were fixed with regression tests, and the full gate was re-run.

## 1. Baseline (builder's commit 38acd2f, fresh `git clone` + `npm ci`)

| Command              | Exit | Result                                                                         |
| -------------------- | ---- | ------------------------------------------------------------------------------ |
| `scripts/verify.ps1` | 0    | npm ci, format, lint, typecheck, 45 unit tests, build, secrets, 6 e2e all pass |

## 2. Final gate (working tree after fixes)

`npm run verify` -> exit **0**:

| #   | Command                | Exit | Result                                                                |
| --- | ---------------------- | ---- | --------------------------------------------------------------------- |
| 1   | `npm run format:check` | 0    | Prettier clean                                                        |
| 2   | `npm run lint`         | 0    | ESLint clean                                                          |
| 3   | `npm run typecheck`    | 0    | `tsc --noEmit` strict                                                 |
| 4   | `npm test`             | 0    | **55 tests / 4 files** passed                                         |
| 5   | `npm run build`        | 0    | production bundle (base `/profit-lab/`)                               |
| 6   | `npm run secrets`      | 0    | `secret-scan: no findings`                                            |
| 7   | `npm run e2e`          | 0    | **10 Playwright tests** passed against the build under `/profit-lab/` |

`npm ci`: 180 packages, 0 vulnerabilities.

## 3. Verify scripts fail loudly

A scratch copy of the repo had one assertion deliberately broken (and separately a format error).
`scripts/verify.ps1` exited 1 at `format check` / `unit tests` respectively and ran no later step;
`scripts/verify.sh` (Git Bash) exited 1 at `unit tests` and ran nothing after it.

## 4. Adversarial checks added (`tests/acceptance-review.test.ts`, `e2e/acceptance.spec.ts`)

- 400 randomized high-rate break-even cases vs an exhaustive integer-cent BigInt search.
- **1,500 randomized scenarios** (random garbage strings such as `abc`, `1e3`, `NaN`, Arabic
  digits, 30-digit numbers; blank shipping; all three allocation methods; both pricing modes)
  recomputed with an independent BigInt oracle: fee, net, gate (exact margin comparison), rank
  (1..n only for qualifying rows), monthly total, summary counts, break-even net >= 0, no
  `NaN`/`Infinity` text.
- Degenerate inputs: $1e9 prices x 1e7 units, 0 units, price $0.01, retention 0 and 100,
  competitor below cost, fee+promo = 100%, 99.99% and 99.99%, 5,000-character name,
  equal-per-product with a zero-unit row (reported incomplete, never divides by zero).
- CSV: BOM, CRLF, quoted embedded newline, header-only, semicolon delimiter, extra cells, short
  rows, percent signs, thousands separators, `$` prefixes, apostrophe/formula names round-trip.
- Workspace JSON: bad `activeScenarioId`, duplicate scenario/product ids, `__proto__` key.
- Browser: workspace replace confirmation, two-tab edit detection, `localStorage` quota failure
  banner, scenario-name clearing.
- Manual: keyboard Tab walk of all four tabs (no control without a visible focus ring or name),
  `aria-sort` toggling, dark mode (`prefers-color-scheme: dark`) screenshots, no horizontal page
  overflow at 320, 375 and 640 px.

## 5. Defects found

| ID  | Severity | Defect                                                                                                                                                                                                                                                                                                                                                                      | Status                                                              |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| D1  | Medium   | Break-even price wrong when fee% + promo% is high (e.g. 40.76% + 54.09%: shown $22.49, true lowest cent price $22.36): the search window started only 3 cents below the closed form and spanned 40 cents, ignoring that rounding noise scales with 1/(1 - rate). The 400-case high-rate fuzz produced failures (first ten listed all disagreed with the exhaustive search). | Fixed: exact band scan; regression test                             |
| D2  | Medium   | Formula injection: input-CSV export guarded only the name column; numeric text fields (user-typed or from an imported workspace JSON) such as `=HYPERLINK(...)` were exported raw.                                                                                                                                                                                          | Fixed: every cell guarded; test                                     |
| D3  | Medium   | Name round-trip corruption: a legitimate name like `'-5 thermometer` lost its apostrophe on export/re-import (import stripped an apostrophe it had not added).                                                                                                                                                                                                              | Fixed: reversible guard; test                                       |
| D4  | Medium   | Workspace JSON import accepted duplicate product/scenario ids (rows alias on edit/delete) and replaced the whole workspace with no confirmation.                                                                                                                                                                                                                            | Fixed: schema rejects duplicates; explicit Replace/Cancel step; e2e |
| D5  | Low      | Disabled "Markup retained" field still validated in entered-price mode: a blank/invalid value made every row incomplete with no way to edit it without switching mode.                                                                                                                                                                                                      | Fixed; test                                                         |
| D6  | Low      | CSV: duplicate header silently used the first column; an unterminated quote silently swallowed the rest of the file into one row with a misleading error; `3 %` stored with a trailing space.                                                                                                                                                                               | Fixed: explicit file errors; test                                   |
| D7  | Low      | A margin displaying as 15.00% could fail the (exact) margin gate with no explanation.                                                                                                                                                                                                                                                                                       | Fixed: row hint + Explain warning; test                             |
| D8  | Low      | Changes saved by another tab were silently overwritten by this tab's next edit.                                                                                                                                                                                                                                                                                             | Fixed: banner on `storage` event; e2e                               |
| D9  | Low      | Scenario name field snapped back to "Untitled" on every clear; compare deltas used JS floats (display-safe, but against the project's own money rule); rows with blank units under "no allocation" were silently omitted from the monthly total.                                                                                                                            | Fixed                                                               |

## 6. Verified with no defect

- Rank exists only for rows that pass every gate; a failing or incomplete row never ranks.
- Gate comparison is exact; penny-boundary sample rows ($5.00 qualifies, $4.99 fails, 15.00%
  exactly qualifies) behave as documented.
- Blank shipping = unknown -> incomplete, never $0. Negative markup and missing costs never
  qualify.
- Persistence: reload round-trip, corrupt data recovery with backup, newer-schema protection,
  storage unavailable.
- Security: no `dangerouslySetInnerHTML`/`eval`, no network I/O, no secrets, MIT license and
  `AI_ASSISTANCE.md` present, no third-party assets, external link uses `rel=noopener`
  (HTTP 200 on the cited eBay page at review time).
- CI and Pages workflows use current major versions (checkout v7, setup-node v7,
  upload-artifact v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5, checked
  against the GitHub releases API); they have never executed (no remote).
- Ethics: no listing, purchase, fulfilment or buyer interaction; Method page states that
  post-sale retail purchasing with direct shipping may be restricted and does not call it
  compliant.

## 7. Remaining issues / not tested

- Workflows have never run on GitHub (no remote exists); not deployed.
- Firefox and Safari untested; no screen reader session (keyboard order, names, focus rings and
  aria-sort were checked by script; color contrast judged from palette and screenshots, not an
  automated audit).
- Local Git author identity (personal e-mail) is in commit history; owner should decide whether to
  rewrite it before publishing.
- No backend exists, so no backend-offline states apply; the public demo has no private
  integrations to separate.
- The randomized suites use a seeded PRNG, not a shrinking property-testing library.
- Screenshots: `docs/screenshots/desktop-products.png`, `desktop-scenarios.png`,
  `mobile-products.png` regenerate identically from the current build.
