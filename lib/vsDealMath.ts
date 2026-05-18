/**
 * Vs deal calculator — guarantee vs % of net (or gross), with optional tier ratchet.
 * Used by Settlement Intelligence step 2.
 */

import { formatMoney } from "@/lib/format";

export type VsDealFinancials = {
  gross_box_office: number;
  platform_fees: number;
  total_expenses: number;
  tickets_sold: number;
  capacity: number;
};

export type VsDealTerms = {
  guarantee: number;
  base_pct: number;
  ratchet_threshold: number | null;
  ratchet_pct: number | null;
  expense_cap: number | null;
  is_vs_gross: boolean;
};

export type VsDealStep = {
  step: number;
  label: string;
  calculation: string;
  result: string;
};

export type VsDealResult = {
  steps: VsDealStep[];
  artist_earns: number;
};

function pctLabel(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function capacityPct(tickets: number, capacity: number): string {
  if (capacity <= 0) return "—";
  return `${((tickets / capacity) * 100).toFixed(1)}%`;
}

export function calculateVsDeal(
  financials: VsDealFinancials,
  terms: VsDealTerms,
): VsDealResult | null {
  const {
    gross_box_office,
    platform_fees,
    total_expenses,
    tickets_sold,
    capacity,
  } = financials;
  const {
    guarantee,
    base_pct,
    ratchet_threshold,
    ratchet_pct,
    is_vs_gross,
  } = terms;

  if (
    !Number.isFinite(guarantee) ||
    !Number.isFinite(base_pct) ||
    !Number.isFinite(gross_box_office)
  ) {
    return null;
  }

  const netBoxOffice = gross_box_office - platform_fees;
  const expensesDeducted = is_vs_gross ? 0 : total_expenses;
  const netAfterExpenses = netBoxOffice - expensesDeducted;

  const hasRatchet =
    ratchet_threshold != null &&
    ratchet_pct != null &&
    Number.isFinite(ratchet_threshold) &&
    Number.isFinite(ratchet_pct) &&
    capacity > 0;

  const sellThrough = capacity > 0 ? tickets_sold / capacity : 0;
  const ratchetMet =
    hasRatchet && sellThrough >= (ratchet_threshold as number);
  const applicablePct = ratchetMet
    ? (ratchet_pct as number)
    : base_pct;

  const percentagePayout = netAfterExpenses * applicablePct;
  const artistEarns = Math.max(guarantee, percentagePayout);
  const guaranteeWins = guarantee >= percentagePayout;

  const steps: VsDealStep[] = [];

  steps.push({
    step: 1,
    label: "Net box office",
    calculation: is_vs_gross
      ? `${formatMoney(gross_box_office)} gross (vs gross — fees not deducted from basis)`
      : `${formatMoney(gross_box_office)} gross − ${formatMoney(platform_fees)} platform fees`,
    result: formatMoney(netBoxOffice),
  });

  steps.push({
    step: 2,
    label: "Net after expenses",
    calculation: is_vs_gross
      ? `${formatMoney(netBoxOffice)} — no expense deduction (vs gross deal)`
      : `${formatMoney(netBoxOffice)} − ${formatMoney(total_expenses)} expenses`,
    result: formatMoney(netAfterExpenses),
  });

  if (hasRatchet) {
    const thresholdPct = ((ratchet_threshold as number) * 100).toFixed(0);
    steps.push({
      step: 3,
      label: "Ratchet check",
      calculation: ratchetMet
        ? `${tickets_sold} / ${capacity} = ${capacityPct(tickets_sold, capacity)} — at or above ${thresholdPct}% threshold, ${pctLabel(ratchet_pct as number)} rate applies`
        : `${tickets_sold} / ${capacity} = ${capacityPct(tickets_sold, capacity)} — below ${thresholdPct}% threshold, base rate applies`,
      result: pctLabel(applicablePct),
    });
  } else {
    steps.push({
      step: 3,
      label: "Rate",
      calculation: "No ratchet on this deal — base percentage applies",
      result: pctLabel(base_pct),
    });
  }

  steps.push({
    step: 4,
    label: "Percentage payout",
    calculation: `${formatMoney(netAfterExpenses)} × ${pctLabel(applicablePct)}`,
    result: formatMoney(percentagePayout),
  });

  steps.push({
    step: 5,
    label: "Guarantee vs percentage",
    calculation: guaranteeWins
      ? `${formatMoney(guarantee)} guarantee is higher than ${formatMoney(percentagePayout)} at ${pctLabel(applicablePct)} — guarantee wins`
      : `${formatMoney(percentagePayout)} at ${pctLabel(applicablePct)} beats the ${formatMoney(guarantee)} guarantee — percentage wins`,
    result: guaranteeWins ? "Guarantee" : "Percentage",
  });

  steps.push({
    step: 6,
    label: "Artist earns",
    calculation: `Higher of guarantee (${formatMoney(guarantee)}) vs percentage (${formatMoney(percentagePayout)})`,
    result: formatMoney(artistEarns),
  });

  if (hasRatchet && capacity > 0) {
    const thresholdTickets = Math.ceil(
      capacity * (ratchet_threshold as number),
    );
    const moreNeeded = Math.max(0, thresholdTickets - tickets_sold);
    steps.push({
      step: 7,
      label: "Crossover to ratchet",
      calculation: ratchetMet
        ? `Already at or above ${((ratchet_threshold as number) * 100).toFixed(0)}% sold (${thresholdTickets} tickets) — ${pctLabel(ratchet_pct as number)} rate is active`
        : `${moreNeeded} more ticket${moreNeeded === 1 ? "" : "s"} needed to reach ${thresholdTickets} (${((ratchet_threshold as number) * 100).toFixed(0)}% of ${capacity}) and trigger ${pctLabel(ratchet_pct as number)}`,
      result:
        moreNeeded === 0
          ? "Ratchet active"
          : `${moreNeeded} more`,
    });
  }

  return { steps, artist_earns: artistEarns };
}
