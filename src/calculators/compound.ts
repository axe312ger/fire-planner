/**
 * Calculate future value with monthly compounding.
 * FV = PV × (1+r/12)^n + PMT × ((1+r/12)^n - 1) / (r/12)
 *
 * @param presentValue - Current balance
 * @param monthlyContribution - Monthly contribution amount
 * @param annualRate - Annual return rate (e.g. 0.07 for 7%)
 * @param months - Number of months
 */
export function futureValue(
  presentValue: number,
  monthlyContribution: number,
  annualRate: number,
  months: number,
): number {
  if (months <= 0) return presentValue;
  if (annualRate === 0) {
    return presentValue + monthlyContribution * months;
  }

  const r = annualRate / 12;
  const factor = Math.pow(1 + r, months);
  return presentValue * factor + monthlyContribution * ((factor - 1) / r);
}

/**
 * Calculate required monthly contribution to reach a target future value.
 * Solves FV formula for PMT:
 * PMT = (FV - PV × (1+r/12)^n) × (r/12) / ((1+r/12)^n - 1)
 */
export function requiredMonthly(
  presentValue: number,
  targetValue: number,
  annualRate: number,
  months: number,
): number {
  if (months <= 0) return Math.max(0, targetValue - presentValue);
  if (annualRate === 0) {
    return Math.max(0, (targetValue - presentValue) / months);
  }

  const r = annualRate / 12;
  const factor = Math.pow(1 + r, months);
  const pmt = (targetValue - presentValue * factor) * (r / (factor - 1));
  return Math.max(0, pmt);
}

/**
 * Calculate how many months to reach a target with monthly contributions.
 * Uses month-by-month simulation.
 * Returns null if target is unreachable (negative growth).
 */
export function monthsToTarget(
  presentValue: number,
  monthlyContribution: number,
  annualRate: number,
  targetValue: number,
  maxMonths: number = 12 * 60, // 60 years max
): number | null {
  if (presentValue >= targetValue) return 0;

  let balance = presentValue;
  const monthlyRate = annualRate / 12;

  for (let m = 1; m <= maxMonths; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (balance >= targetValue) return m;
  }

  return null;
}
