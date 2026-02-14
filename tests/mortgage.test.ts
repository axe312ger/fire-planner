import { describe, expect, it } from 'vitest';
import { monthlyMortgagePayment, calculateMortgage } from '../src/calculators/mortgage.js';
import type { PropertyConfig } from '../src/types.js';

describe('monthlyMortgagePayment', () => {
  it('€400k at 3.2% over 25 years → known monthly payment', () => {
    // P = 400000, r = 3.2% annual, n = 25 years
    const monthly = monthlyMortgagePayment(400_000, 3.2, 25);
    // Expected ~€1,939/mo (verified with standard amortization calculator)
    expect(monthly).toBeCloseTo(1_939, -1);
  });

  it('zero interest → equal monthly instalments', () => {
    const monthly = monthlyMortgagePayment(120_000, 0, 10);
    expect(monthly).toBe(1_000);
  });

  it('zero principal → zero payment', () => {
    expect(monthlyMortgagePayment(0, 3.2, 25)).toBe(0);
  });

  it('€300k at 3.5% over 30 years', () => {
    const monthly = monthlyMortgagePayment(300_000, 3.5, 30);
    // ~€1,347/mo
    expect(monthly).toBeCloseTo(1_347, -1);
  });
});

describe('calculateMortgage', () => {
  it('calculates full mortgage details for flat', () => {
    const flat: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 20,
      feesPercent: 12,
      additionalCosts: 0,
      purchaseYear: 3,
      mortgageRate: 3.2,
      mortgageTerm: 30,
      label: 'Flat',
    };

    const result = calculateMortgage(flat);
    expect(result.downPayment).toBe(100_000);
    expect(result.fees).toBe(60_000);
    expect(result.totalCashNeeded).toBe(160_000);
    expect(result.loanAmount).toBe(400_000);
    expect(result.monthlyPayment).toBeGreaterThan(1_500);
    expect(result.monthlyPayment).toBeLessThan(2_000);
  });

  it('calculates full mortgage details for finca', () => {
    const finca: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 30,
      feesPercent: 12,
      additionalCosts: 0,
      purchaseYear: 7,
      mortgageRate: 3.2,
      mortgageTerm: 25,
      label: 'Finca',
    };

    const result = calculateMortgage(finca);
    expect(result.downPayment).toBe(150_000);
    expect(result.fees).toBe(60_000);
    expect(result.totalCashNeeded).toBe(210_000);
    expect(result.loanAmount).toBe(350_000);
    expect(result.monthlyPayment).toBeGreaterThan(1_500);
  });
});
