import type { FireConfig, PropertyConfig } from '../types.js';
import { DEFAULT_FIRE_CONFIG, DEFAULT_FLAT, DEFAULT_FINCA } from '../config/defaults.js';
import { fireNumber, propertyCashNeeded } from '../calculators/fire.js';
import { gapAnalysis } from '../calculators/fire.js';
import { calculateMortgage } from '../calculators/mortgage.js';
import { buildAllScenarios } from '../calculators/scenarios.js';
import {
  renderSummaryHeader,
  renderScenarioTable,
  renderScenarioComparison,
  renderGapAnalysis,
  renderMortgageSummary,
  renderDetailedBreakdown,
  renderPhases,
} from '../formatters/table.js';

interface CalculateOptions {
  age?: string;
  targetAge?: string;
  expenses?: string;
  withdrawalRate?: string;
  inflation?: string;
  portfolio?: string;
  cash?: string;
  monthly?: string;
  rent?: string;
  rentStartMonth?: string;
  parentLoanYears?: string;
  flatPrice?: string;
  flatDown?: string;
  flatFees?: string;
  flatInterior?: string;
  flatYear?: string;
  flatTerm?: string;
  fincaPrice?: string;
  fincaDown?: string;
  fincaFees?: string;
  fincaYear?: string;
  rates?: string;
  mortgageRate?: string;
  startDate?: string;
  birthMonth?: string;
}

export function calculateCommand(opts: CalculateOptions): void {
  const config: FireConfig = {
    currentAge: num(opts.age, DEFAULT_FIRE_CONFIG.currentAge),
    targetAge: num(opts.targetAge, DEFAULT_FIRE_CONFIG.targetAge),
    annualExpenses: num(opts.expenses, DEFAULT_FIRE_CONFIG.annualExpenses),
    withdrawalRate: num(opts.withdrawalRate, DEFAULT_FIRE_CONFIG.withdrawalRate),
    inflationRate: num(opts.inflation, DEFAULT_FIRE_CONFIG.inflationRate),
    currentPortfolio: num(opts.portfolio, DEFAULT_FIRE_CONFIG.currentPortfolio),
    currentCash: num(opts.cash, DEFAULT_FIRE_CONFIG.currentCash),
    monthlyInvestment: num(opts.monthly, DEFAULT_FIRE_CONFIG.monthlyInvestment),
    monthlyRent: num(opts.rent, DEFAULT_FIRE_CONFIG.monthlyRent),
    rentStartMonth: opts.rentStartMonth !== undefined ? num(opts.rentStartMonth, DEFAULT_FIRE_CONFIG.rentStartMonth!) : DEFAULT_FIRE_CONFIG.rentStartMonth,
    parentLoanYears: num(opts.parentLoanYears, DEFAULT_FIRE_CONFIG.parentLoanYears),
    returnRates: opts.rates
      ? opts.rates.split(',').map((r) => parseFloat(r) / 100)
      : DEFAULT_FIRE_CONFIG.returnRates,
    startDate: opts.startDate ?? DEFAULT_FIRE_CONFIG.startDate,
    birthMonth: opts.birthMonth ? num(opts.birthMonth, DEFAULT_FIRE_CONFIG.birthMonth!) : DEFAULT_FIRE_CONFIG.birthMonth,
  };

  const mortRate = num(opts.mortgageRate, DEFAULT_FLAT.mortgageRate);

  const flat: PropertyConfig = {
    price: num(opts.flatPrice, DEFAULT_FLAT.price),
    downPaymentPercent: num(opts.flatDown, DEFAULT_FLAT.downPaymentPercent),
    feesPercent: num(opts.flatFees, DEFAULT_FLAT.feesPercent),
    additionalCosts: num(opts.flatInterior, DEFAULT_FLAT.additionalCosts),
    purchaseYear: num(opts.flatYear, DEFAULT_FLAT.purchaseYear),
    mortgageRate: mortRate,
    mortgageTerm: num(opts.flatTerm, DEFAULT_FLAT.mortgageTerm),
    label: DEFAULT_FLAT.label,
  };

  const fincaPrice = num(opts.fincaPrice, DEFAULT_FINCA.price);

  // Build property list — skip properties with price 0
  const properties: PropertyConfig[] = [];

  if (flat.price > 0) {
    properties.push(flat);
  }

  if (fincaPrice > 0) {
    const finca: PropertyConfig = {
      price: fincaPrice,
      downPaymentPercent: num(opts.fincaDown, DEFAULT_FINCA.downPaymentPercent),
      feesPercent: num(opts.fincaFees, DEFAULT_FINCA.feesPercent),
      additionalCosts: DEFAULT_FINCA.additionalCosts,
      purchaseYear: num(opts.fincaYear, DEFAULT_FINCA.purchaseYear),
      mortgageRate: mortRate,
      mortgageTerm: DEFAULT_FINCA.mortgageTerm,
      label: DEFAULT_FINCA.label,
    };
    properties.push(finca);
  }

  // Summary header
  const fireNum = fireNumber(config.annualExpenses, config.withdrawalRate);
  const currentAssets = config.currentPortfolio + config.currentCash;
  console.log(renderSummaryHeader(fireNum, currentAssets, config.monthlyInvestment, config.targetAge, config.currentAge));

  // Detailed property purchase breakdown
  if (properties.length > 0) {
    const moderateRate = config.returnRates[Math.floor(config.returnRates.length / 2)] ?? 0.07;
    console.log(renderDetailedBreakdown(config, properties, moderateRate));
  }

  // Scenarios
  const scenarios = buildAllScenarios(config, properties);

  // Phase breakdown (from moderate scenario)
  const moderateScenario = scenarios[Math.floor(scenarios.length / 2)];
  if (moderateScenario?.phases) {
    console.log(renderPhases(config, moderateScenario.phases));
  }

  for (const scenario of scenarios) {
    console.log(renderScenarioTable(scenario));
  }

  // Comparison
  console.log(renderScenarioComparison(scenarios));

  // Gap analysis (using moderate rate)
  const moderateRate = config.returnRates[Math.floor(config.returnRates.length / 2)] ?? 0.07;
  const gap = gapAnalysis(config, properties, moderateRate);
  console.log(renderGapAnalysis(gap));

  // Mortgage info
  const mortgages = properties.map(calculateMortgage);
  if (mortgages.length > 0) {
    console.log(renderMortgageSummary(mortgages));
  }

  console.log('');
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}
