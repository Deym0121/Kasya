/**
 * Paywall math, kept pure so the numbers shown are always derived from the
 * store's real prices (a hard-coded "SAVE 33%" that drifts from the actual
 * prices is an App Review 3.1.2 / 2.3.1 problem).
 */

/** Whole-percent saving of yearly vs 12× monthly, or null when not meaningful. */
export function savingsPct(monthly: number | null | undefined, yearly: number | null | undefined): number | null {
  if (!monthly || !yearly || monthly <= 0 || yearly <= 0) return null;
  const pct = Math.round((1 - yearly / (monthly * 12)) * 100);
  return pct >= 5 && pct <= 90 ? pct : null;
}

/** Free-trial length in days from a RevenueCat intro price (only if it's free). */
export function trialDays(
  intro: { price: number; periodUnit: string; periodNumberOfUnits: number; cycles: number } | null | undefined,
): number | null {
  if (!intro || intro.price !== 0) return null;
  const per: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
  const unit = per[String(intro.periodUnit).toUpperCase()];
  if (!unit) return null;
  const days = unit * Math.max(1, intro.periodNumberOfUnits) * Math.max(1, intro.cycles);
  return days > 0 ? days : null;
}

/** The disclosure Apple requires next to a trial CTA. */
export function trialDisclosure(days: number, priceString: string, period: 'year' | 'month'): string {
  return `Free for ${days} days, then ${priceString} per ${period}. Cancel anytime before the trial ends and you won't be charged.`;
}
