# Contributing

1. Node.js 20.19+ (developed on 24) and npm.
2. `npm ci`
3. `npm run dev` for a local server at `http://localhost:5173/profit-lab/`.
4. Before opening a pull request run `npm run verify` (format, lint, types, tests, build, secret
   scan, Playwright). All steps must pass.

## Rules for changes

- Money is decimal arithmetic only (`src/domain/numbers.ts`). No `number` math on amounts.
- Any change to `src/domain/calc.ts` needs a unit test and must keep
  `tests/reference-model.test.ts` (the independent integer-cents oracle) passing.
- Do not add real marketplace data, real fee schedules presented as official, or any network
  call without discussion.
- Keep the UI honest: no decorative controls, no fixture data outside the labeled sample mode.
- Add the user-visible behavior to `docs/demo.md` and limits to `docs/known-limitations.md`.

## Formatting

Prettier (`npm run format`) and ESLint (`npm run lint`) are enforced in CI.
