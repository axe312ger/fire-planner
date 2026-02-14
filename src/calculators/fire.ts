import type { FireConfig, GapAnalysis, PropertyConfig } from '../types.js';
import { requiredMonthly } from './compound.js';

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
  const gap = Math.max(0, totalNeeded - currentAssets);

  const months = years * 12;
  const reqMonthly = requiredMonthly(currentAssets, totalNeeded, returnRate, months);

  return {
    fireNumber: basicFire,
    inflationAdjustedFireNumber: adjustedFire,
    totalPropertyCash,
    totalNeeded,
    currentAssets,
    gap,
    requiredMonthly: reqMonthly,
    currentMonthly: config.monthlyInvestment,
    monthlyShortfall: Math.max(0, reqMonthly - config.monthlyInvestment),
  };
}
