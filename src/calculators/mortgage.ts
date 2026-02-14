import type { MortgageResult, PropertyConfig } from '../types.js';

/**
 * Calculate monthly mortgage payment using the standard formula:
 * M = P × r(1+r)^n / ((1+r)^n - 1)
 *
 * @param principal - Loan amount
 * @param annualRate - Annual interest rate (e.g. 3.2 for 3.2%)
 * @param termYears - Loan term in years
 */
export function monthlyMortgagePayment(
  principal: number,
  annualRate: number,
  termYears: number,
): number {
  if (principal <= 0) return 0;
  if (annualRate === 0) return principal / (termYears * 12);

  const r = annualRate / 100 / 12; // monthly rate
  const n = termYears * 12; // total payments
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
}

/**
 * Calculate full mortgage details for a property.
 */
export function calculateMortgage(property: PropertyConfig): MortgageResult {
  const downPayment = property.price * (property.downPaymentPercent / 100);
  const fees = property.price * (property.feesPercent / 100);
  const loanAmount = property.price - downPayment;
  const monthly = monthlyMortgagePayment(loanAmount, property.mortgageRate, property.mortgageTerm);

  return {
    label: property.label,
    propertyPrice: property.price,
    loanAmount,
    downPayment,
    fees,
    totalCashNeeded: downPayment + fees,
    monthlyPayment: monthly,
    mortgageRate: property.mortgageRate,
    termYears: property.mortgageTerm,
  };
}
