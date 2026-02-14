import type {
  FireConfig,
  PropertyConfig,
  Scenario,
  YearProjection,
} from '../types.js';
import { inflationAdjustedFireNumber } from './fire.js';
import { propertyCashNeeded } from './fire.js';
import { monthlyMortgagePayment } from './mortgage.js';
import { SCENARIO_LABELS } from '../config/defaults.js';

/**
 * Build a year-by-year projection for a given return rate.
 * Property milestones are modeled as withdrawals in the year they occur.
 * If the portfolio can't cover the property cost, a parent loan bridges the gap.
 * After a property purchase, monthly investment is reduced by the mortgage payment.
 */
export function buildScenario(
  config: FireConfig,
  properties: PropertyConfig[],
  returnRate: number,
): Scenario {
  const years = config.targetAge - config.currentAge;
  const label = SCENARIO_LABELS[returnRate] ?? `${(returnRate * 100).toFixed(0)}% return`;

  // Build property data map: yearOffset → PropertyConfig
  const propertyMap = new Map<number, PropertyConfig>();
  for (const prop of properties) {
    propertyMap.set(prop.purchaseYear, prop);
  }

  const projections: YearProjection[] = [];
  let balance = config.currentPortfolio + config.currentCash;
  let fireReachedYear: number | null = null;
  let fireReachedAge: number | null = null;
  let feasible = true;
  let currentMonthly = config.monthlyInvestment;
  let totalParentLoan = 0;

  for (let y = 1; y <= years; y++) {
    const startBalance = balance;
    const annualContribution = currentMonthly * 12;
    const growth = startBalance * returnRate;

    let propertyWithdrawal = 0;
    let propertyLabel: string | undefined;
    let parentLoan = 0;

    const prop = propertyMap.get(y);
    if (prop) {
      const cashNeeded = propertyCashNeeded(prop);
      propertyLabel = prop.label;

      const availableBalance = startBalance + annualContribution + growth;

      if (availableBalance >= cashNeeded) {
        // Can fully cover property from own savings
        propertyWithdrawal = cashNeeded;
      } else {
        // Need parent loan for the gap
        parentLoan = cashNeeded - Math.max(0, availableBalance);
        propertyWithdrawal = Math.max(0, availableBalance); // withdraw everything we have
        totalParentLoan += parentLoan;
      }

      // After purchase, reduce monthly investment by mortgage payment
      const loanAmount = prop.price * (1 - prop.downPaymentPercent / 100);
      const mortgageMonthly = monthlyMortgagePayment(loanAmount, prop.mortgageRate, prop.mortgageTerm);
      currentMonthly = Math.max(0, currentMonthly - mortgageMonthly);
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
      parentLoan: parentLoan > 0 ? parentLoan : undefined,
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
    parentLoanTotal: totalParentLoan > 0 ? totalParentLoan : undefined,
    monthlyAfterMortgage: currentMonthly,
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
