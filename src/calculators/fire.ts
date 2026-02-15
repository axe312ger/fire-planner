import type { FireConfig, GapAnalysis, PropertyConfig } from '../types.js';
import { requiredMonthly } from './compound.js';
import { buildScenario } from './scenarios.js';

/**
 * Calculate the basic FIRE number: annual expenses / withdrawal rate.
 */
export function fireNumber(annualExpenses: number, withdrawalRate: number): number {
  return annualExpenses / withdrawalRate;
}

/**
 * Calculate inflation-adjusted FIRE number.
 * Accounts for expenses growing with inflation over the given years.
 */
export function inflationAdjustedFireNumber(
  annualExpenses: number,
  withdrawalRate: number,
  inflationRate: number,
  years: number,
): number {
  const adjustedExpenses = annualExpenses * Math.pow(1 + inflationRate, years);
  return adjustedExpenses / withdrawalRate;
}

/**
 * Calculate inflation-adjusted FIRE number at a specific month offset.
 * Convenience wrapper that converts months to fractional years.
 */
export function inflationAdjustedFireNumberAtMonth(
  annualExpenses: number,
  withdrawalRate: number,
  inflationRate: number,
  months: number,
): number {
  return inflationAdjustedFireNumber(annualExpenses, withdrawalRate, inflationRate, months / 12);
}

/**
 * Calculate the total cash needed for a property purchase (down payment + fees).
 */
export function propertyCashNeeded(property: PropertyConfig): number {
  return property.price * ((property.downPaymentPercent + property.feesPercent) / 100) + (property.additionalCosts ?? 0);
}

/**
 * Perform a gap analysis: what you need vs what you have.
 */
export function gapAnalysis(
  config: FireConfig,
  properties: PropertyConfig[],
  returnRate: number,
): GapAnalysis {
  const years = config.targetAge - config.currentAge;
  const basicFire = fireNumber(config.annualExpenses, config.withdrawalRate);
  const adjustedFire = inflationAdjustedFireNumber(
    config.annualExpenses,
    config.withdrawalRate,
    config.inflationRate,
    years,
  );

  const totalPropertyCash = properties.reduce((sum, p) => sum + propertyCashNeeded(p), 0);
  const totalNeeded = adjustedFire + totalPropertyCash;
  const currentAssets = config.currentPortfolio + config.currentCash;
  const gap = totalNeeded - currentAssets;

  const months = years * 12;

  // Use binary search with the actual scenario engine to find the required monthly
  // that reaches the inflation-adjusted FIRE target, accounting for all phases
  const reqMonthly = properties.length > 0
    ? requiredMonthlyWithPhases(config, properties, returnRate, adjustedFire)
    : requiredMonthly(currentAssets, adjustedFire, returnRate, months);

  return {
    fireNumber: basicFire,
    inflationAdjustedFireNumber: adjustedFire,
    totalPropertyCash,
    totalNeeded,
    currentAssets,
    gap,
    requiredMonthly: reqMonthly,
    currentMonthly: config.monthlyInvestment,
    monthlyShortfall: reqMonthly - config.monthlyInvestment,
  };
}

/**
 * Binary search for the required monthlyInvestment that makes the scenario
 * reach the FIRE target, accounting for property purchases, mortgage phases, etc.
 */
function requiredMonthlyWithPhases(
  config: FireConfig,
  properties: PropertyConfig[],
  returnRate: number,
  fireTarget: number,
): number {
  let lo = 0;
  let hi = 50_000; // reasonable upper bound
  const tolerance = 1; // within €1

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const testConfig = { ...config, monthlyInvestment: mid };
    const scenario = buildScenario(testConfig, properties, returnRate);
    if (scenario.finalBalance >= fireTarget) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (hi - lo < tolerance) break;
  }

  return Math.ceil(hi);
}
