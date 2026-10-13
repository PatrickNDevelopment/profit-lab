# Demo walkthrough

Run `npm run dev` and open `http://localhost:5173/profit-lab/`.

## Journey 1: sample data, fee tier and allocation

1. **Products** tab → **Load sample data**. A "Sample data" banner appears; 8 synthetic rows load.
2. Default scenario: **5 qualify, 2 fail, 1 incomplete**. Sample 1 nets exactly $5.00 (qualifies);
   Sample 2 nets $4.99 (one cent short); Sample 3 sits exactly at 15.00% margin.
3. Change **Marketplace fee tier** to _Example C_: only Samples 5 and 7 still qualify. Switch back
   to _Example A_ and the original result is restored exactly.
4. Set **Overhead allocation method** to _None_: an amber warning states $30.00/month is
   unallocated and Sample 1 now shows $5.50.
5. Press **Explain** on any row for the line-by-line calculation.

## Journey 2: import, correct, compare, export

1. **Import / Export** → paste a CSV that has one bad value (for example `abc` as a source cost).
2. The report lists the CSV line and the reason; **Import all** stays disabled.
3. Fix the text in the box; the report updates; **Import all 3 rows**.
4. **Scenarios** → **Duplicate**, then on **Products** choose _Markup-retention rule_ for the copy.
   **Explain** shows `price = landed + retention × (competitor − landed)` with the undercut.
5. **Scenarios** → compare _Baseline_ and _Baseline (copy)_ side by side.
6. **Import / Export** → **Download results (CSV)**.

## Things to try

- Leave source shipping blank: the row becomes _Incomplete_ (unknown is not free).
- Type `12.345` in a money field: flagged invalid, never rounded silently.
- Reload the page: your products and scenarios persist.
