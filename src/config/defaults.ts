import type { FireConfig, PropertyConfig } from '../types.js';

export const DEFAULT_FIRE_CONFIG: FireConfig = {
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

export const DEFAULT_FLAT: PropertyConfig = {
  price: 500_000,
  downPaymentPercent: 20,
  feesPercent: 12,
  purchaseYear: 3,
  mortgageRate: 3.2,
  mortgageTerm: 30,
  label: 'Flat (primera vivienda)',
};

export const DEFAULT_FINCA: PropertyConfig = {
  price: 500_000,
  downPaymentPercent: 30,
  feesPercent: 12,
  purchaseYear: 7,
  mortgageRate: 3.2,
  mortgageTerm: 25,
  label: 'Finca (segunda vivienda)',
};

export const SCENARIO_LABELS: Record<number, string> = {
  0.05: 'Conservative (5%)',
  0.07: 'Moderate (7%)',
  0.09: 'Optimistic (9%)',
};

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
