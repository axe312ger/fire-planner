import { describe, expect, it } from 'vitest';
import { fireNumber, inflationAdjustedFireNumber, inflationAdjustedFireNumberAtMonth, propertyCashNeeded, gapAnalysis } from '../src/calculators/fire.js';
import type { PropertyConfig } from '../src/types.js';

describe('fireNumber', () => {
  it('at 4% withdrawal → expenses × 25', () => {
    expect(fireNumber(60_000, 0.04)).toBe(1_500_000);
  });

  it('at 3.5% withdrawal → expenses × ~28.57', () => {
    expect(fireNumber(60_000, 0.035)).toBeCloseTo(1_714_285.71, 0);
  });

  it('at 3% withdrawal → expenses × ~33.33', () => {
    expect(fireNumber(60_000, 0.03)).toBeCloseTo(2_000_000, 0);
  });
});

describe('inflationAdjustedFireNumber', () => {
  it('grows correctly over years', () => {
    const basic = fireNumber(60_000, 0.04);
    const adjusted = inflationAdjustedFireNumber(60_000, 0.04, 0.02, 10);
    // 60000 * 1.02^10 / 0.04 = 60000 * 1.21899 / 0.04 ≈ 1,828,492
    expect(adjusted).toBeGreaterThan(basic);
    expect(adjusted).toBeCloseTo(1_828_492, -2);
  });

  it('with zero inflation → equals basic FIRE number', () => {
    const basic = fireNumber(60_000, 0.04);
    const adjusted = inflationAdjustedFireNumber(60_000, 0.04, 0, 10);
    expect(adjusted).toBe(basic);
  });
});

describe('inflationAdjustedFireNumberAtMonth', () => {
  it('at 12 months equals 1-year inflation adjustment', () => {
    const atYear = inflationAdjustedFireNumber(60_000, 0.04, 0.02, 1);
    const atMonth = inflationAdjustedFireNumberAtMonth(60_000, 0.04, 0.02, 12);
    expect(atMonth).toBeCloseTo(atYear, 2);
  });

  it('at 120 months equals 10-year inflation adjustment', () => {
    const atYear = inflationAdjustedFireNumber(60_000, 0.04, 0.02, 10);
    const atMonth = inflationAdjustedFireNumberAtMonth(60_000, 0.04, 0.02, 120);
    expect(atMonth).toBeCloseTo(atYear, 2);
  });

  it('at 6 months gives fractional year inflation', () => {
    // 60000 * (1.02)^0.5 / 0.04
    const expected = 60_000 * Math.pow(1.02, 0.5) / 0.04;
    const result = inflationAdjustedFireNumberAtMonth(60_000, 0.04, 0.02, 6);
    expect(result).toBeCloseTo(expected, 2);
  });
});

describe('propertyCashNeeded', () => {
  it('calculates down payment + fees correctly', () => {
    const prop: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 20,
      feesPercent: 12,
      additionalCosts: 0,
      purchaseYear: 3,
      mortgageRate: 3.2,
      mortgageTerm: 30,
      label: 'Test',
    };
    // 500k * (20% + 12%) = 500k * 32% = 160k
    expect(propertyCashNeeded(prop)).toBe(160_000);
  });

  it('includes additional costs (interior)', () => {
    const prop: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 20,
      feesPercent: 12,
      additionalCosts: 30_000,
      purchaseYear: 1,
      mortgageRate: 3.2,
      mortgageTerm: 20,
      label: 'Flat + interior',
    };
    // 500k * 32% + 30k = 190k
    expect(propertyCashNeeded(prop)).toBe(190_000);
  });

  it('with 30% down + 12% fees', () => {
    const prop: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 30,
      feesPercent: 12,
      additionalCosts: 0,
      purchaseYear: 7,
      mortgageRate: 3.2,
      mortgageTerm: 25,
      label: 'Finca',
    };
    // 500k * 42% = 210k
    expect(propertyCashNeeded(prop)).toBe(210_000);
  });
});

describe('gapAnalysis', () => {
  it('identifies correct monthly shortfall', () => {
    const config = {
      currentAge: 35,
      targetAge: 45,
      annualExpenses: 60_000,
      withdrawalRate: 0.04,
      inflationRate: 0.02,
      currentPortfolio: 9_000,
      currentCash: 7_500,
      monthlyInvestment: 1_000,
      monthlyRent: 0,
      parentLoanYears: 10,
      returnRates: [0.07],
    };
    const properties: PropertyConfig[] = [];
    const gap = gapAnalysis(config, properties, 0.07);

    expect(gap.fireNumber).toBe(1_500_000);
    expect(gap.inflationAdjustedFireNumber).toBeCloseTo(1_828_492, -2);
    expect(gap.currentAssets).toBe(16_500);
    expect(gap.gap).toBeCloseTo(1_811_992, -2);
    expect(gap.requiredMonthly).toBeGreaterThan(config.monthlyInvestment);
    expect(gap.monthlyShortfall).toBeGreaterThan(0);
  });

  it('with property: required monthly accounts for mortgage phases', () => {
    const config = {
      currentAge: 35,
      targetAge: 55,
      annualExpenses: 40_000,
      withdrawalRate: 0.04,
      inflationRate: 0.02,
      currentPortfolio: 9_000,
      currentCash: 7_500,
      monthlyInvestment: 4_000,
      monthlyRent: 1_400,
      parentLoanYears: 10,
      returnRates: [0.07],
    };
    const property: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 20,
      feesPercent: 12,
      additionalCosts: 30_000,
      purchaseYear: 1,
      mortgageRate: 3.2,
      mortgageTerm: 20,
      label: 'Flat',
    };

    const gap = gapAnalysis(config, [property], 0.07);

    // With property phases (mortgage eating into monthly capacity),
    // required monthly should be higher than without property
    const gapNoProperty = gapAnalysis(config, [], 0.07);
    expect(gap.requiredMonthly).toBeGreaterThan(gapNoProperty.requiredMonthly);
  });

  it('shows surplus when current savings exceed required', () => {
    const config = {
      currentAge: 35,
      targetAge: 45,
      annualExpenses: 10_000,
      withdrawalRate: 0.04,
      inflationRate: 0.02,
      currentPortfolio: 100_000,
      currentCash: 50_000,
      monthlyInvestment: 5_000,
      monthlyRent: 0,
      parentLoanYears: 10,
      returnRates: [0.07],
    };
    const gap = gapAnalysis(config, [], 0.07);

    expect(gap.fireNumber).toBe(250_000);
    // With 150k starting and 5k/mo at 7%, easily exceeds 304k adjusted FIRE
    expect(gap.monthlyShortfall).toBeLessThan(0); // surplus
  });
});
