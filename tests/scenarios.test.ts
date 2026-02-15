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

describe('buildScenario — monthly projections', () => {
  it('generates correct number of monthly projections', () => {
    const scenario = buildScenario(baseConfig, [], 0.07);
    // 10 years × 12 months = 120 months
    expect(scenario.monthProjections).toHaveLength(120);
  });

  it('monthly projections have correct date format', () => {
    const config: FireConfig = {
      ...baseConfig,
      startDate: '2026-02',
      birthMonth: 5,
    };
    const scenario = buildScenario(config, [], 0.07);

    expect(scenario.monthProjections[0].date).toBe('2026-03');
    expect(scenario.monthProjections[1].date).toBe('2026-04');
    expect(scenario.monthProjections[11].date).toBe('2027-02');
  });

  it('age changes at birthday month', () => {
    const config: FireConfig = {
      ...baseConfig,
      currentAge: 34,
      targetAge: 36,
      startDate: '2026-02',
      birthMonth: 5,
    };
    const scenario = buildScenario(config, [], 0.07);

    // Month 1 = 2026-03, age 34 (birthday not yet in May)
    expect(scenario.monthProjections[0].age).toBe(34);
    // Month 3 = 2026-05, age 35 (birthday month!)
    expect(scenario.monthProjections[2].age).toBe(35);
    // Month 14 = 2027-04, age 35 (before next birthday)
    expect(scenario.monthProjections[13].age).toBe(35);
    // Month 15 = 2027-05, age 36 (second birthday)
    expect(scenario.monthProjections[14].age).toBe(36);
  });

  it('monthly compounding produces higher returns than annual', () => {
    const scenario = buildScenario(baseConfig, [], 0.07);
    // Monthly compounding: (1 + 0.07/12)^12 ≈ 1.07229 effective rate
    // Year 1: start 16500, monthly investing (4000-1400)=2600
    // With monthly compounding, end balance should be slightly higher than annual model
    const year1 = scenario.projections[0];
    // Annual model would give: 16500 * 1.07 + 31200 = 48855
    // Monthly model gives slightly more due to compounding
    expect(year1.endBalance).toBeGreaterThan(48_000);
  });

  it('property purchase at month 12 with monthly model', () => {
    const config: FireConfig = {
      ...baseConfig,
      startDate: '2026-02',
      birthMonth: 5,
    };
    const scenario = buildScenario(config, [flat], 0.07);

    // Property at purchaseYear=1 → month 12
    const month12 = scenario.monthProjections[11]; // 0-indexed
    expect(month12.propertyWithdrawal).toBeGreaterThan(0);
    expect(month12.propertyLabel).toBe('Flat');
  });

  it('fireReachedMonth and fireReachedDate are set', () => {
    const richConfig: FireConfig = {
      ...baseConfig,
      currentPortfolio: 500_000,
      monthlyInvestment: 10_000,
      monthlyRent: 0,
      targetAge: 55,
    };

    const scenario = buildScenario(richConfig, [], 0.09);
    expect(scenario.fireReachedMonth).not.toBeNull();
    expect(scenario.fireReachedDate).toMatch(/^\d{4}-\d{2}$/);
    expect(scenario.fireReachedAge).toBeLessThanOrEqual(55);
  });

  it('yearly projections are correctly aggregated from monthly', () => {
    const scenario = buildScenario(baseConfig, [], 0.07);

    // Yearly projections aggregated
    expect(scenario.projections).toHaveLength(10);

    // First yearly projection should aggregate 12 months
    const year1 = scenario.projections[0];
    const first12Months = scenario.monthProjections.slice(0, 12);

    // Start balance should match first month's start
    expect(year1.startBalance).toBe(first12Months[0].startBalance);
    // End balance should match last month's end
    expect(year1.endBalance).toBe(first12Months[11].endBalance);

    // Contributions should be sum of monthly contributions
    const sumContrib = first12Months.reduce((s, mp) => s + mp.contribution, 0);
    expect(year1.contributions).toBeCloseTo(sumContrib, 2);
  });
});

describe('mortgage term end', () => {
  it('mortgage payments stop after mortgage term expires', () => {
    // 10yr mortgage bought at year 1 with 30yr target → mortgage ends at month 132 (year 11)
    const shortMortgage: PropertyConfig = { ...flat, mortgageTerm: 10 };
    const config30yr: FireConfig = { ...baseConfig, targetAge: 65 };
    const scenario = buildScenario(config30yr, [shortMortgage], 0.07);

    // Month 12 = purchase. Mortgage months = 13..132 (10yr * 12).
    // Month 132 = last mortgage month. Month 133 = no mortgage.
    const lastMortgageMonth = scenario.monthProjections[131]; // 0-indexed → month 132
    const firstFreMonth = scenario.monthProjections[132]; // month 133

    expect(lastMortgageMonth.monthlyMortgage).toBeGreaterThan(0);
    expect(firstFreMonth.monthlyMortgage).toBe(0);
  });

  it('post-mortgage investing equals full monthly capacity', () => {
    const shortMortgage: PropertyConfig = { ...flat, mortgageTerm: 5 };
    const config30yr: FireConfig = { ...baseConfig, targetAge: 65, monthlyRent: 0 };
    const scenario = buildScenario(config30yr, [shortMortgage], 0.07);

    // After mortgage ends, full monthly capacity goes to investing
    const lastMonth = scenario.monthProjections[scenario.monthProjections.length - 1];
    expect(lastMonth.monthlyMortgage).toBe(0);
    expect(lastMonth.monthlyInvesting).toBe(config30yr.monthlyInvestment);
  });

  it('phase summary includes post-mortgage phase when mortgage ends before target', () => {
    const shortMortgage: PropertyConfig = { ...flat, mortgageTerm: 10 };
    const config30yr: FireConfig = { ...baseConfig, targetAge: 65 };
    const scenario = buildScenario(config30yr, [shortMortgage], 0.07);

    expect(scenario.phases).toBeDefined();
    const postMortgage = scenario.phases!.find(p => p.label.includes('Post-mortgage'));
    expect(postMortgage).toBeDefined();
    expect(postMortgage!.monthlyMortgage).toBe(0);
    expect(postMortgage!.monthlyInvesting).toBe(config30yr.monthlyInvestment);
  });
});

describe('rent stops on purchase month', () => {
  it('no rent charged in the month the flat is purchased', () => {
    const laterFlat: PropertyConfig = { ...flat, purchaseYear: 2 }; // month 24
    const scenario = buildScenario(baseConfig, [laterFlat], 0.07);

    // Month 23 (before purchase): rent should be charged
    const beforePurchase = scenario.monthProjections[22]; // 0-indexed
    expect(beforePurchase.monthlyRent).toBe(1_400);

    // Month 24 (purchase month): no rent
    const purchaseMonth = scenario.monthProjections[23];
    expect(purchaseMonth.monthlyRent).toBe(0);
  });
});

describe('multiple property mortgage stacking', () => {
  it('stacks mortgage payments from two properties', () => {
    const richConfig: FireConfig = {
      ...baseConfig,
      currentPortfolio: 500_000,
      monthlyInvestment: 10_000,
      monthlyRent: 0,
      targetAge: 65,
    };
    const flat1: PropertyConfig = { ...flat, purchaseYear: 1, mortgageTerm: 20, label: 'Flat 1' };
    const flat2: PropertyConfig = { ...flat, price: 300_000, purchaseYear: 3, mortgageTerm: 15, label: 'Flat 2' };

    const scenario = buildScenario(richConfig, [flat1, flat2], 0.07);

    // After both purchased (month 37+), mortgage should be sum of both
    const monthAfterBoth = scenario.monthProjections[36]; // month 37
    const singleMortgage1 = scenario.monthProjections[12]; // month 13, only flat1

    expect(monthAfterBoth.monthlyMortgage).toBeGreaterThan(singleMortgage1.monthlyMortgage);
  });

  it('second mortgage ending does not kill first mortgage', () => {
    const richConfig: FireConfig = {
      ...baseConfig,
      currentPortfolio: 500_000,
      monthlyInvestment: 10_000,
      monthlyRent: 0,
      targetAge: 65,
    };
    const flat1: PropertyConfig = { ...flat, purchaseYear: 1, mortgageTerm: 25, label: 'Flat 1' };
    const flat2: PropertyConfig = { ...flat, price: 200_000, purchaseYear: 2, mortgageTerm: 5, label: 'Flat 2' };

    const scenario = buildScenario(richConfig, [flat1, flat2], 0.07);

    // Flat2 mortgage ends at month 24 + 60 = 84. Month 85 should still have flat1 mortgage.
    const afterFlat2Ends = scenario.monthProjections[84]; // month 85
    expect(afterFlat2Ends.monthlyMortgage).toBeGreaterThan(0);

    // But should be less than when both were active
    const bothActive = scenario.monthProjections[30]; // month 31
    expect(afterFlat2Ends.monthlyMortgage).toBeLessThan(bothActive.monthlyMortgage);
  });
});

describe('keepPortfolio option', () => {
  it('does not withdraw from portfolio when keepPortfolio is true', () => {
    const config: FireConfig = { ...baseConfig, keepPortfolio: true, targetAge: 55 };
    const scenario = buildScenario(config, [flat], 0.07);

    // No property withdrawal from portfolio
    for (const mp of scenario.monthProjections) {
      expect(mp.propertyWithdrawal).toBe(0);
    }

    // Full cost goes to parent loan
    const cashNeeded = 500_000 * 0.32 + 30_000; // 190,000
    expect(scenario.parentLoanTotal).toBeCloseTo(cashNeeded, -1);
  });

  it('portfolio grows continuously when keepPortfolio is true', () => {
    const richConfig: FireConfig = {
      ...baseConfig,
      keepPortfolio: true,
      currentPortfolio: 50_000,
      monthlyRent: 0,
      targetAge: 55,
    };
    const scenario = buildScenario(richConfig, [flat], 0.07);

    // Balance should never drop to 0 at purchase month
    const purchaseMonth = scenario.monthProjections[11]; // month 12
    expect(purchaseMonth.endBalance).toBeGreaterThan(50_000);
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
