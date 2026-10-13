# Known limitations

- **Projections only.** No realized-profit tracking, no sales or demand estimates, no live data.
- **Fee tiers are examples.** They are not any marketplace's real schedule; real fees often vary
  by category, store level, promotions and shipping. Use the Custom tier or per-row overrides.
- **Single currency, USD formatting** only. No tax, returns, chargebacks or currency conversion.
- **One fee model:** percentage + fixed. No tiered-by-price or category-cap fees.
- **Overhead allocation** is per-unit or equal-per-product; no revenue-share method
  (it would be circular with break-even price).
- **Break-even** searches a few cents around the closed form under cent rounding; it is the lowest
  cent price with net ≥ 0 in that neighbourhood and reports "unattainable" when rates reach 100%.
- **Local storage only.** Per-browser, per-origin, subject to browser clearing; cap ≈ 5 MB.
  No sync between devices; use the exports.
- **Spreadsheet formula guard** apostrophe-prefixes text cells that start with `= + - @`; other
  CSV dialect issues (semicolon locales, non-UTF-8) are not handled.
- **Accessibility** has only been checked by an automated test (every form control has an
  accessible name; no horizontal page overflow at 375 px) plus review of screenshots. There has
  been no screen-reader, full keyboard-walkthrough or 200%-zoom audit.
- **Tested browser:** Microsoft Edge (Chromium) locally and Chromium in CI. Firefox/Safari
  are untested.
- **Not deployed.** The Pages workflow exists but has never run.
