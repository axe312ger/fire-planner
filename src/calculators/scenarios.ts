import type {
  FireConfig,
  PropertyConfig,
  Scenario,
  ScenarioPhase,
  YearProjection,
} from '../types.js';
import { inflationAdjustedFireNumber } from './fire.js';
import { propertyCashNeeded } from './fire.js';
import { monthlyMortgagePayment } from './mortgage.js';
import { SCENARIO_LABELS } from '../config/defaults.js';

/**
 * Build a year-by-year projection for a given return rate.
 *
 * Models three financial phases:
 * 1. Pre-purchase: savings reduced by rent
 * 2. Post-purchase (parent loan active): savings reduced by mortgage + parent loan repayment
 * 3. Post-parent-loan: savings reduced by mortgage only
 *
 * If the portfolio can't cover property costs, a parent loan bridges the gap.
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

  // Monthly budget tracking
  let monthlyMortgage = 0;
  let monthlyParentLoan = 0;
  let parentLoanEndYear = 0; // year when parent loan is fully repaid
  let totalParentLoan = 0;

  const phases: ScenarioPhase[] = [];

  // Track first property purchase year to know when rent stops
  const firstPurchaseYear = properties.length > 0
    ? Math.min(...properties.map((p) => p.purchaseYear))
    : Infinity;

  for (let y = 1; y <= years; y++) {
    const startBalance = balance;

    // Determine monthly savings for this year
    const rent = y <= firstPurchaseYear ? (config.monthlyRent ?? 0) : 0;
    const parentLoanPayment = (y > firstPurchaseYear && y <= parentLoanEndYear) ? monthlyParentLoan : 0;
    const mortgage = y > firstPurchaseYear ? monthlyMortgage : 0;

    const monthlySavings = Math.max(0, config.monthlyInvestment - rent - mortgage - parentLoanPayment);
    const annualContribution = monthlySavings * 12;
    const growth = startBalance * returnRate;

    let propertyWithdrawal = 0;
    let propertyLabel: string | undefined;
    let parentLoan = 0;

    const prop = propertyMap.get(y);
    if (prop) {
      const cashNeeded = propertyCashNeeded(prop);
      propertyLabel = prop.label;

      // In the purchase year, rent is still paid up to purchase, but we
      // also use the full year's contributions for the purchase
      const availableBalance = startBalance + annualContribution + growth;

      if (availableBalance >= cashNeeded) {
        propertyWithdrawal = cashNeeded;
      } else {
        parentLoan = cashNeeded - Math.max(0, availableBalance);
        propertyWithdrawal = Math.max(0, availableBalance);
        totalParentLoan += parentLoan;
      }

      // Set up post-purchase monthly costs
      const loanAmount = prop.price * (1 - prop.downPaymentPercent / 100);
      monthlyMortgage = monthlyMortgagePayment(loanAmount, prop.mortgageRate, prop.mortgageTerm);

      // Parent loan repayment (interest-free, spread over N years)
      const totalLoanForProperty = parentLoan;
      if (totalLoanForProperty > 0 && config.parentLoanYears > 0) {
        monthlyParentLoan = totalLoanForProperty / (config.parentLoanYears * 12);
        parentLoanEndYear = y + config.parentLoanYears;
      }
    }

    // Check if parent loan just ended this year
    if (y === parentLoanEndYear + 1) {
      monthlyParentLoan = 0;
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

  // Build phase summary
  if (properties.length > 0 && firstPurchaseYear <= years) {
    const prop = propertyMap.get(firstPurchaseYear)!;
    const loanAmount = prop.price * (1 - prop.downPaymentPercent / 100);
    const mortgagePayment = monthlyMortgagePayment(loanAmount, prop.mortgageRate, prop.mortgageTerm);
    const parentRepayment = totalParentLoan > 0
      ? totalParentLoan / (config.parentLoanYears * 12)
      : 0;

    // Phase 0: Pre-purchase (if purchase isn't year 1... but even year 1 has the rent phase)
    if (firstPurchaseYear >= 1) {
      const rent = config.monthlyRent ?? 0;
      const investing = Math.max(0, config.monthlyInvestment - rent);
      phases.push({
        label: 'Before flat (paying rent)',
        fromAge: config.currentAge + 1,
        toAge: config.currentAge + firstPurchaseYear,
        monthlyInvesting: investing,
        monthlyMortgage: 0,
        monthlyParentLoan: 0,
        monthlyRent: rent,
      });
    }

    // Phase 1: Mortgage + parent loan
    if (totalParentLoan > 0 && config.parentLoanYears > 0) {
      const endAge = Math.min(config.currentAge + firstPurchaseYear + config.parentLoanYears, config.targetAge);
      const investing = Math.max(0, config.monthlyInvestment - mortgagePayment - parentRepayment);
      phases.push({
        label: 'Mortgage + parent loan repayment',
        fromAge: config.currentAge + firstPurchaseYear + 1,
        toAge: endAge,
        monthlyInvesting: investing,
        monthlyMortgage: mortgagePayment,
        monthlyParentLoan: parentRepayment,
        monthlyRent: 0,
      });

      // Phase 2: Mortgage only (after parent loan done)
      if (endAge < config.targetAge) {
        const investing2 = Math.max(0, config.monthlyInvestment - mortgagePayment);
        phases.push({
          label: 'Mortgage only (parent loan done)',
          fromAge: endAge + 1,
          toAge: config.targetAge,
          monthlyInvesting: investing2,
          monthlyMortgage: mortgagePayment,
          monthlyParentLoan: 0,
          monthlyRent: 0,
        });
      }
    } else {
      // No parent loan — just mortgage
      const investing = Math.max(0, config.monthlyInvestment - mortgagePayment);
      phases.push({
        label: 'Mortgage only',
        fromAge: config.currentAge + firstPurchaseYear + 1,
        toAge: config.targetAge,
        monthlyInvesting: investing,
        monthlyMortgage: mortgagePayment,
        monthlyParentLoan: 0,
        monthlyRent: 0,
      });
    }
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
    phases: phases.length > 0 ? phases : undefined,
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
