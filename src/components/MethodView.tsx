export function MethodView() {
  return (
    <>
      <h1>Method &amp; limits</h1>

      <section className="panel prose">
        <h2>What the numbers mean</h2>
        <p>
          Every figure is a <strong>projection</strong> computed from inputs you entered or
          imported. ProfitLab has no connection to any marketplace, order system or sales history,
          so it cannot show <em>realized</em> profit and it never invents sales estimates.
        </p>
        <h2>Formulas</h2>
        <ul>
          <li>Marketplace fee = round(price × fee% ÷ 100, to the cent, half up) + fixed fee.</li>
          <li>Promoted listing cost = round(price × promoted% ÷ 100, to the cent, half up).</li>
          <li>Landed cost = source cost + source shipping.</li>
          <li>
            Net profit per unit = price − fee − promoted − landed − packaging − other variable −
            allocated overhead.
          </li>
          <li>Margin = net ÷ price. Gates compare exactly, with no rounding of the comparison.</li>
          <li>
            Break-even price = the lowest cent price whose net profit is ≥ 0 given the same fee
            rounding.
          </li>
          <li>
            Optional markup-retention rule: price = landed + retained% × (competitor − landed),
            rounded to the cent. Undercut = competitor − price.
          </li>
        </ul>
        <h2>Overhead allocation</h2>
        <ul>
          <li>
            <strong>Per unit pool:</strong> monthly overhead ÷ total monthly units of all rows with
            a valid units value.
          </li>
          <li>
            <strong>Equal per product:</strong> monthly overhead ÷ number of products with units
            &gt; 0, then ÷ that product&apos;s units.
          </li>
          <li>
            <strong>Do not allocate:</strong> allowed, but the app shows the unallocated amount and
            flags every row, because profit is then overstated.
          </li>
        </ul>
        <h2>Observed vs assumed</h2>
        <p>
          Each row labels its cost inputs and price inputs as observed or assumed. Rows that rely on
          any assumed input carry an “assumed inputs” marker everywhere, including exports.
        </p>
        <h2>Money arithmetic</h2>
        <p>
          All amounts use decimal arithmetic (decimal.js). Inputs accept at most two decimal places;
          anything else is rejected rather than silently rounded.
        </p>
        <h2>Fee tiers are examples</h2>
        <p>
          The built-in tiers are illustrative. Check the marketplace&apos;s current official fee
          schedule and enter your real figures as the Custom tier or per-row overrides.
        </p>
        <h2>Out of scope, on purpose</h2>
        <ul>
          <li>No listing creation, order handling or fulfillment automation.</li>
          <li>
            No endorsement that any sourcing model is permitted. In particular, buying from a
            retailer after a sale and shipping directly to a buyer may be restricted by marketplace
            policy; read the marketplace&apos;s own current policy (for example eBay&apos;s{' '}
            <a
              href="https://export.ebay.com/en/services-tools/shipping/shipping-tips-and-best-practice/drop-shipping/"
              rel="noopener noreferrer"
              target="_blank"
            >
              dropshipping guidance
            </a>
            ) before relying on any model.
          </li>
          <li>Not tax, legal or financial advice.</li>
        </ul>
        <h2>Privacy</h2>
        <p>
          Data stays in this browser&apos;s local storage. Nothing is sent to a server. Clearing
          site data removes it; use the exports to keep copies.
        </p>
      </section>
    </>
  );
}
