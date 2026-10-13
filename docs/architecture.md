# Architecture

## Shape

Static single-page app (Vite + React + TypeScript). No backend, no network I/O. Built with
`base: '/profit-lab/'` for GitHub Pages project hosting. There is no client router (tabs are
component state), so refresh on any view works under the prefix.

```
src/
  domain/            pure, framework-free, unit-tested
    numbers.ts       Decimal clone (40 digits, half-up), strict field readers
    calc.ts          scenario params, overhead pool, per-row economics, break-even, ranking
    feeTiers.ts      illustrative example tiers
    csv.ts           RFC 4180 parser, import validation, export, formula guard
    storage.ts       Zod schema, load/save, corruption + version handling
    sample.ts        labeled synthetic data, defaults
    types.ts
  components/        ProductsView, ScenarioPanel, ScenariosView, ImportExportView, MethodView
  App.tsx            state owner, single write path (update + persist), banners, tabs
```

## Data flow

`AppState {products, scenarios, activeScenarioId}` → `computeAll(products, activeScenario)` →
`RowResult[] + Summary` (memoized). All user-entered numbers are stored as **raw text** and parsed
at calculation time, so a half-typed or invalid value is shown as an issue rather than coerced.
Every state change goes through one function in `App.tsx` that updates React state and writes to
`localStorage`.

## Key decisions

| Decision                                        | Reason                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Decimal strings, no JS floats for money         | Exact cents; avoids 0.1+0.2 drift in gates                                     |
| Round each fee line half-up to the cent         | Matches how fees are charged; makes results reproducible by integer arithmetic |
| Gate comparison is exact (`net ≥ min% × price`) | A displayed 15.00% that is really 14.996% must not pass                        |
| Blank shipping = unknown → incomplete           | Unknown cost must never become a silent $0                                     |
| Overhead allocation is an explicit setting      | Unallocated fixed cost must be visible, never implied zero                     |
| Rank only when qualifying                       | Sorting by profit must not let a failing row appear "best"                     |
| Break-even by exact cent-band scan              | Per-line rounding moves net by <= 1 cent; only that band needs scanning        |
| Raw-text state + strict readers                 | No partial parsing, no locale surprises                                        |
| Own CSV parser (~40 lines)                      | Small surface, fully tested, no dependency                                     |
| Zod only at the persistence boundary            | Validates untrusted storage/JSON, keeps hot paths simple                       |

## Verification strategy

`tests/reference-model.test.ts` re-implements the economics with BigInt integer cents and compares
600 randomized scenarios (and 300 break-even cases) against the Decimal engine. The two share no
code.

## Visual identity

Ledger-paper palette (warm paper, green ink, amber warnings), Georgia headings, monospace
numerals, light/dark via `prefers-color-scheme`, visible focus rings, ≥36 px controls, reduced
motion honoured.
