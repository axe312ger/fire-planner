import { describe, expect, it } from 'vitest';
import { buildScenario, buildAllScenarios } from '../src/calculators/scenarios.js';
import type { FireConfig, PropertyConfig } from '../src/types.js';

const baseConfig: FireConfig = {
  currentAge: 35,
  targetAge: 45,
  annualExpenses: 60_000,
  withdrawalRate: 0.04,
  inflationRate: 0.02,
  currentPortfolio: 9_000,
  currentCash: 7_500,
  monthlyInvestment: 1_000,
  returnRates: [0.05, 0.07, 0.09],
};

const flat: PropertyConfig = {
  price: 500_000,
  downPaymentPercent: 20,
  feesPercent: 12,
  purchaseYear: 3,
  mortgageRate: 3.2,
  mortgageTerm: 30,
  label: 'Flat',
};

describe('buildScenario', () => {
  it('with no property milestones → smooth growth', () => {
    const scenario = buildScenario(baseConfig, [], 0.07);

    expect(scenario.projections).toHaveLength(10);
    expect(scenario.feasible).toBe(true);

    // Each year's end balance should be greater than start (no withdrawals)
    for (const p of scenario.projections) {
      expect(p.endBalance).toBeGreaterThan(p.startBalance);
      expect(p.propertyWithdrawal).toBe(0);
    }
  });

  it('with property that can be fully covered → no parent loan', () => {
    // Rich config: can cover €160k cash needed for flat
    const richConfig: FireConfig = {
      ...baseConfig,
      currentPortfolio: 200_000,
      monthlyInvestment: 5_000,
    };

    const scenario = buildScenario(richConfig, [flat], 0.07);
    const year3 = scenario.projections[2];

    expect(year3.propertyWithdrawal).toBe(160_000); // 500k * 32%
    expect(year3.propertyLabel).toBe('Flat');
    expect(year3.parentLoan).toBeUndefined();
    expect(scenario.parentLoanTotal).toBeUndefined();
  });

  it('with property that exceeds balance → parent loan bridges the gap', () => {
    // baseConfig: ~€16.5k starting, €1k/mo — can't cover €160k in 3 years
    const scenario = buildScenario(baseConfig, [flat], 0.07);
    const year3 = scenario.projections[2];

    expect(year3.propertyLabel).toBe('Flat');
    expect(year3.parentLoan).toBeGreaterThan(0);
    expect(scenario.parentLoanTotal).toBeGreaterThan(0);
    expect(scenario.feasible).toBe(true); // parent loan makes it feasible

    // Parent loan + own savings should equal the total cash needed
    const cashNeeded = 160_000;
    expect(year3.propertyWithdrawal + year3.parentLoan!).toBeCloseTo(cashNeeded, -1);

    // After property, balance should be ~0
    expect(year3.endBalance).toBeCloseTo(0, -1);
  });

  it('calculates correct parent loan amount', () => {
    // Simple case: buy flat at year 1 with minimal savings
    const earlyFlat: PropertyConfig = { ...flat, purchaseYear: 1 };
    const scenario = buildScenario(baseConfig, [earlyFlat], 0.07);
    const year1 = scenario.projections[0];

    // Starting: €16,500, contrib: €12,000, growth: €16,500 * 0.07 = €1,155
    // Available: ~€29,655
    // Cash needed: €160,000
    // Parent loan: ~€130,345
    expect(year1.parentLoan).toBeGreaterThan(120_000);
    expect(year1.parentLoan).toBeLessThan(140_000);
    expect(scenario.parentLoanTotal).toBe(year1.parentLoan);
  });

  it('reduces monthly investment after mortgage', () => {
    const earlyFlat: PropertyConfig = { ...flat, purchaseYear: 1 };
    const scenario = buildScenario(baseConfig, [earlyFlat], 0.07);

    // Year 1: property purchase, monthly gets reduced
    // Mortgage: €400k at 3.2% for 30yr ≈ €1,730/mo
    // Starting monthly: €1,000
    // After mortgage: max(0, 1000 - 1730) = 0
    expect(scenario.monthlyAfterMortgage).toBe(0);

    // Year 2 contributions should be €0 (monthly wiped out by mortgage)
    const year2 = scenario.projections[1];
    expect(year2.contributions).toBe(0);
  });

  it('monthly after mortgage is positive if savings exceed mortgage', () => {
    const highSavingsConfig: FireConfig = {
      ...baseConfig,
      monthlyInvestment: 5_000,
    };
    const earlyFlat: PropertyConfig = { ...flat, purchaseYear: 1 };
    const scenario = buildScenario(highSavingsConfig, [earlyFlat], 0.07);

    // Mortgage ≈ €1,730/mo, savings €5,000/mo → after = ~€3,270/mo
    expect(scenario.monthlyAfterMortgage!).toBeGreaterThan(3_000);
    expect(scenario.monthlyAfterMortgage!).toBeLessThan(3_500);

    // Year 2 contributions should reflect the reduced monthly
    const year2 = scenario.projections[1];
    expect(year2.contributions).toBeCloseTo(scenario.monthlyAfterMortgage! * 12, -2);
  });

  it('FIRE reached → correct year identified', () => {
    // High monthly + high return to ensure FIRE is reached
    const richConfig: FireConfig = {
      ...baseConfig,
      currentPortfolio: 500_000,
      monthlyInvestment: 10_000,
      targetAge: 55,
    };

    const scenario = buildScenario(richConfig, [], 0.09);
    expect(scenario.fireReachedYear).not.toBeNull();
    expect(scenario.fireReachedAge).not.toBeNull();
    expect(scenario.fireReachedAge!).toBeLessThanOrEqual(55);
  });

  it('realistic flat-at-year-1 scenario with €2k/mo savings', () => {
    // Mirrors the user's real situation
    const userConfig: FireConfig = {
      currentAge: 35,
      targetAge: 55,
      annualExpenses: 60_000,
      withdrawalRate: 0.04,
      inflationRate: 0.02,
      currentPortfolio: 9_381,
      currentCash: 7_460,
      monthlyInvestment: 2_000,
      returnRates: [0.07],
    };
    const earlyFlat: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 20,
      feesPercent: 12,
      purchaseYear: 1,
      mortgageRate: 3.2,
      mortgageTerm: 30,
      label: 'Flat',
    };

    const scenario = buildScenario(userConfig, [earlyFlat], 0.07);
    const year1 = scenario.projections[0];

    // Starting: €16,841
    // Year 1 contrib: €24,000
    // Year 1 growth: €16,841 * 0.07 = €1,179
    // Available: ~€42,020
    // Cash needed: €160,000
    // Parent loan: ~€117,980
    expect(year1.parentLoan).toBeGreaterThan(110_000);
    expect(year1.parentLoan).toBeLessThan(125_000);

    // Mortgage: ~€1,730/mo, savings: €2,000/mo → after: ~€270/mo
    expect(scenario.monthlyAfterMortgage!).toBeGreaterThan(200);
    expect(scenario.monthlyAfterMortgage!).toBeLessThan(350);

    // Should be feasible (parent loan covers the gap)
    expect(scenario.feasible).toBe(true);
  });
});

describe('buildAllScenarios', () => {
  it('builds scenarios for all return rates', () => {
    const scenarios = buildAllScenarios(baseConfig, []);
    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].returnRate).toBe(0.05);
    expect(scenarios[1].returnRate).toBe(0.07);
    expect(scenarios[2].returnRate).toBe(0.09);
  });

  it('higher return rates produce higher final balances', () => {
    const scenarios = buildAllScenarios(baseConfig, []);
    expect(scenarios[2].finalBalance).toBeGreaterThan(scenarios[1].finalBalance);
    expect(scenarios[1].finalBalance).toBeGreaterThan(scenarios[0].finalBalance);
  });
});
