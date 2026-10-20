# Known limitations

- **Projections only.** No realized-profit tracking, no sales or demand estimates, no live data.
- **Fee tiers are examples.** They are not any marketplace's real schedule; real fees often vary
  by category, store level, promotions and shipping. Use the Custom tier or per-row overrides.
- **Single currency, USD formatting** only. No tax, returns, chargebacks or currency conversion.
- **One fee model:** percentage + fixed. No tiered-by-price or category-cap fees.
- **Overhead allocation** is per-unit or equal-per-product; no revenue-share method
  (it would be circular with break-even price).
- **Break-even** is the lowest cent price with net ≥ 0 under per-line cent rounding, found by
  scanning the exact band the rounding can affect (wide only for extreme fee+promo rates near
  100%); it reports "unattainable" when fee + promoted rates reach 100%.
- **Per-unit overhead is rounded to the cent**, so units × rounded overhead can differ from the
  monthly overhead by a few cents; the unrounded split is not shown.
- **Two tabs:** another tab's save is detected and flagged, but there is no merge; the last tab
  to save wins.
- **Workspace JSON is validated structurally** (types, duplicate ids), not semantically; field
  text such as an unreadable price simply makes that row incomplete.
- **Local storage only.** Per-browser, per-origin, subject to browser clearing; cap ≈ 5 MB.
  No sync between devices; use the exports.
- **Spreadsheet formula guard** apostrophe-prefixes every exported input/text cell that starts
  with `= + - @` (re-import strips exactly one apostrophe); other
  CSV dialect issues (semicolon locales, non-UTF-8) are not handled.
- **Accessibility** has only been checked by an automated test (every form control has an
  accessible name; no horizontal page overflow at 375 px) plus review of screenshots. There has
  been no screen-reader, full keyboard-walkthrough or 200%-zoom audit.
- **Browsers:** the end-to-end suite runs in Chromium, Firefox and WebKit (Safari's engine) in CI
  and was run in all three locally on 2026-10-20 (Edge for Chromium). WebKit is not Safari itself, and
  there has been no screen-reader session. In WebKit, as in Safari by default, Tab skips links.
- **Hosted demo:** https://patrickndevelopment.github.io/profit-lab/ (GitHub Pages, static, no backend). The first CI and Pages runs on GitHub passed on 2026-10-15.
- **Shared browser storage on the demo site.** All ten portfolio demos are served from
  `patrickndevelopment.github.io`, so they share one browser storage quota (about 5 MB). Each app
  uses its own `profitlab.*` keys and only reacts to changes of its own keys, but a very large workspace
  in one demo can make saving fail in another (the app then shows its save-failed notice). A local
  run has its own origin and is not affected.
