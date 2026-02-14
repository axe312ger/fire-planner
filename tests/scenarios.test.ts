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

  it('with property withdrawal → balance drops at milestone year', () => {
    const flat: PropertyConfig = {
      price: 500_000,
      downPaymentPercent: 20,
      feesPercent: 12,
      purchaseYear: 3,
      mortgageRate: 3.2,
      mortgageTerm: 30,
      label: 'Flat',
    };

    const scenario = buildScenario(baseConfig, [flat], 0.07);
    const year3 = scenario.projections[2]; // 0-indexed, year 3

    expect(year3.propertyWithdrawal).toBe(160_000); // 500k * 32%
    expect(year3.propertyLabel).toBe('Flat');
  });

  it('withdrawal exceeding balance → flagged as infeasible', () => {
    const expensive: PropertyConfig = {
      price: 2_000_000,
      downPaymentPercent: 30,
      feesPercent: 12,
      purchaseYear: 1,
      mortgageRate: 3.2,
      mortgageTerm: 25,
      label: 'Expensive',
    };

    const scenario = buildScenario(baseConfig, [expensive], 0.05);
    expect(scenario.feasible).toBe(false);
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
