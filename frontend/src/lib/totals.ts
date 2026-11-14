export interface Line {
  type: 'part' | 'labour';
  qty: number | string;
  unit_price: number | string;
}

export interface Totals {
  parts: number;
  labour: number;
  tax: number;
  total: number;
  estimate: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Same maths as the backend view v_work_order_totals. */
export function computeTotals(items: Line[], concerns: { estimate?: number | string | null }[], hstRate: number): Totals {
  let parts = 0;
  let labour = 0;
  for (const it of items) {
    const amount = cents((Number(it.qty) || 0) * (Number(it.unit_price) || 0));
    if (it.type === 'labour') labour += amount;
    else parts += amount;
  }
  parts = cents(parts);
  labour = cents(labour);
  const tax = cents((parts + labour) * hstRate);
  const estimate = cents(concerns.reduce((s, c) => s + (Number(c.estimate) || 0), 0));
  return { parts, labour, tax, total: cents(parts + labour + tax), estimate };
}
