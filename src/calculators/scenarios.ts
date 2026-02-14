import type {
  FireConfig,
  PropertyConfig,
  Scenario,
  YearProjection,
} from '../types.js';
import { inflationAdjustedFireNumber } from './fire.js';
import { propertyCashNeeded } from './fire.js';
import { SCENARIO_LABELS } from '../config/defaults.js';

/**
 * Build a year-by-year projection for a given return rate.
 * Property milestones are modeled as withdrawals in the year they occur.
 */
export function buildScenario(
  config: FireConfig,
  properties: PropertyConfig[],
  returnRate: number,
): Scenario {
  const years = config.targetAge - config.currentAge;
  const label = SCENARIO_LABELS[returnRate] ?? `${(returnRate * 100).toFixed(0)}% return`;

  // Build property withdrawal map: yearOffset → { amount, label }
  const propertyWithdrawals = new Map<number, { amount: number; label: string }>();
  for (const prop of properties) {
    const cash = propertyCashNeeded(prop);
    propertyWithdrawals.set(prop.purchaseYear, {
      amount: cash,
      label: prop.label,
    });
  }

  const projections: YearProjection[] = [];
  let balance = config.currentPortfolio + config.currentCash;
  let fireReachedYear: number | null = null;
  let fireReachedAge: number | null = null;
  let feasible = true;

  for (let y = 1; y <= years; y++) {
    const startBalance = balance;
    const annualContribution = config.monthlyInvestment * 12;
    const growth = startBalance * returnRate;

    let propertyWithdrawal = 0;
    let propertyLabel: string | undefined;

    const pw = propertyWithdrawals.get(y);
    if (pw) {
      propertyWithdrawal = pw.amount;
      propertyLabel = pw.label;
    }

    balance = startBalance + annualContribution + growth - propertyWithdrawal;

    if (balance < 0) {
      feasible = false;
      balance = 0;
    }

    // Check if FIRE target is reached this year
    const adjustedFire = inflationAdjustedFireNumber(
      config.annualExpenses,
      config.withdrawalRate,
      config.inflationRate,
      y,
    );

    if (fireReachedYear === null && balance >= adjustedFire) {
      fireReachedYear = y;
      fireReachedAge = config.currentAge + y;
    }

    projections.push({
      year: y,
      age: config.currentAge + y,
      startBalance,
      contributions: annualContribution,
      growth,
      propertyWithdrawal,
      propertyLabel,
      endBalance: balance,
    });
  }

  return {
    label,
    returnRate,
    projections,
    fireReachedYear,
    fireReachedAge,
    finalBalance: balance,
    feasible,
  };
}

/**
 * Build multiple scenarios for different return rates.
 */
export function buildAllScenarios(
  config: FireConfig,
  properties: PropertyConfig[],
): Scenario[] {
  return config.returnRates.map((rate) => buildScenario(config, properties, rate));
}
