import { describe, expect, it } from 'vitest';
import { buildScenario, buildAllScenarios } from '../src/calculators/scenarios.js';
import type { FireConfig, PropertyConfig } from '../src/types.js';

const baseConfig: FireConfig = {
  currentAge: 35,
  targetAge: 45,
  annualExpenses: 40_000,
  withdrawalRate: 0.04,
  inflationRate: 0.02,
  currentPortfolio: 9_000,
  currentCash: 7_500,
  monthlyInvestment: 4_000,
  monthlyRent: 1_400,
  parentLoanYears: 10,
  returnRates: [0.05, 0.07, 0.09],
};

const flat: PropertyConfig = {
  price: 500_000,
  downPaymentPercent: 20,
  feesPercent: 12,
  additionalCosts: 30_000,
  purchaseYear: 1,
  mortgageRate: 3.2,
  mortgageTerm: 20,
  label: 'Flat',
};

describe('buildScenario', () => {
  it('with no property milestones → smooth growth', () => {
    const scenario = buildScenario(baseConfig, [], 0.07);

    expect(scenario.projections).toHaveLength(10);
    expect(scenario.feasible).toBe(true);

    for (const p of scenario.projections) {
      expect(p.endBalance).toBeGreaterThan(p.startBalance);
      expect(p.propertyWithdrawal).toBe(0);
    }
  });

  it('pre-purchase years have rent deducted from contributions', () => {
    // Flat at year 3 — years 1 and 2 should have rent deducted
    const laterFlat: PropertyConfig = { ...flat, purchaseYear: 3 };
    const scenario = buildScenario(baseConfig, [laterFlat], 0.07);

    const year1 = scenario.projections[0];
    // Monthly: 4000 - 1400 rent = 2600/mo → 31,200/yr
    expect(year1.contributions).toBeCloseTo(31_200, -2);
  });

  it('with property that can be fully covered → no parent loan', () => {
    const richConfig: FireConfig = {
      ...baseConfig,
      currentPortfolio: 200_000,
      monthlyInvestment: 10_000,
      monthlyRent: 0,
    };

    const scenario = buildScenario(richConfig, [flat], 0.07);
    const year1 = scenario.projections[0];

    expect(year1.parentLoan).toBeUndefined();
    expect(scenario.parentLoanTotal).toBeUndefined();
  });

  it('calculates parent loan including interior costs', () => {
    const scenario = buildScenario(baseConfig, [flat], 0.07);
    const year1 = scenario.projections[0];

    // Cash needed: 500k * 32% + 30k interior = 190,000
    // Available: starting 16,500 + (4000-1400)*12 + growth ≈ ~49k
    // Parent loan: ~141k
    expect(year1.parentLoan).toBeGreaterThan(130_000);
    expect(year1.parentLoan).toBeLessThan(150_000);
    expect(scenario.parentLoanTotal).toBe(year1.parentLoan);
  });

  it('reduces monthly by mortgage + parent loan repayment after purchase', () => {
    const scenario = buildScenario(baseConfig, [flat], 0.07);

    // After purchase: monthly = 4000 - mortgage(~2260) - parentLoan(~141k/120mo ≈ ~1175)
    // = 4000 - 2260 - 1175 ≈ 565/mo → ~6780/yr
    const year2 = scenario.projections[1];
    expect(year2.contributions).toBeGreaterThan(4_000);
    expect(year2.contributions).toBeLessThan(10_000);
  });

  it('contributions increase after parent loan is repaid', () => {
    const config20yr: FireConfig = { ...baseConfig, targetAge: 60 };
    const scenario = buildScenario(config20yr, [flat], 0.07);

    // Year 2 (mortgage + parent loan) vs year 12 (mortgage only, parent loan done)
    const earlyYear = scenario.projections[1]; // year 2
    const lateYear = scenario.projections[11]; // year 12, parent loan done

    expect(lateYear.contributions).toBeGreaterThan(earlyYear.contributions);
  });

  it('generates phase breakdown', () => {
    const config25yr: FireConfig = { ...baseConfig, targetAge: 60 };
    const scenario = buildScenario(config25yr, [flat], 0.07);

    expect(scenario.phases).toBeDefined();
    expect(scenario.phases!.length).toBeGreaterThanOrEqual(2);

    // First phase: rent
    expect(scenario.phases![0].monthlyRent).toBe(1_400);
    expect(scenario.phases![0].monthlyMortgage).toBe(0);

    // Second phase: mortgage + parent loan
    expect(scenario.phases![1].monthlyMortgage).toBeGreaterThan(2_000);
    expect(scenario.phases![1].monthlyParentLoan).toBeGreaterThan(0);

    // Third phase: mortgage only
    if (scenario.phases!.length >= 3) {
      expect(scenario.phases![2].monthlyParentLoan).toBe(0);
      expect(scenario.phases![2].monthlyInvesting).toBeGreaterThan(scenario.phases![1].monthlyInvesting);
    }
  });

  it('FIRE reached → correct year identified', () => {
    const richConfig: FireConfig = {
      ...baseConfig,
      currentPortfolio: 500_000,
      monthlyInvestment: 10_000,
      monthlyRent: 0,
      targetAge: 55,
    };

    const scenario = buildScenario(richConfig, [], 0.09);
    expect(scenario.fireReachedYear).not.toBeNull();
    expect(scenario.fireReachedAge).toBeLessThanOrEqual(55);
  });

  it('realistic user scenario: flat at year 1, 20yr mortgage, €4k savings', () => {
    const userConfig: FireConfig = {
      currentAge: 35,
      targetAge: 55,
      annualExpenses: 40_000,
      withdrawalRate: 0.04,
      inflationRate: 0.02,
      currentPortfolio: 9_381,
      currentCash: 7_460,
      monthlyInvestment: 4_000,
      monthlyRent: 1_400,
      parentLoanYears: 10,
      returnRates: [0.07],
    };
    const userFlat: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 20,
      feesPercent: 12,
      additionalCosts: 30_000,
      purchaseYear: 1,
      mortgageRate: 3.2,
      mortgageTerm: 20,
      label: 'Flat',
    };

    const scenario = buildScenario(userConfig, [userFlat], 0.07);

    // Parent loan should be ~€141k (190k needed - ~49k projected)
    expect(scenario.parentLoanTotal).toBeGreaterThan(130_000);
    expect(scenario.parentLoanTotal).toBeLessThan(150_000);

    // Should be feasible (parent loan covers gap)
    expect(scenario.feasible).toBe(true);

    // Has 3 phases: rent, mortgage+parent, mortgage only
    expect(scenario.phases).toBeDefined();
    expect(scenario.phases!.length).toBe(3);

    // After parent loan (year 12+), investing should be >€1,500/mo
    const mortgageOnlyPhase = scenario.phases![2];
    expect(mortgageOnlyPhase.monthlyInvesting).toBeGreaterThan(1_500);
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
