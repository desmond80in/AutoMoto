import { money, pct } from '../lib/format';
import type { Totals } from '../lib/totals';

export function TotalsBox({ totals, hstRate }: { totals: Totals; hstRate: number }) {
  return (
    <div className="totals" aria-label="Totals">
      <div><span>Parts subtotal</span><span data-testid="t-parts">{money(totals.parts)}</span></div>
      <div><span>Labour</span><span data-testid="t-labour">{money(totals.labour)}</span></div>
      <div><span>HST {pct(hstRate)}</span><span data-testid="t-tax">{money(totals.tax)}</span></div>
      <div><span>Total</span><span data-testid="t-total">{money(totals.total)}</span></div>
    </div>
  );
}
