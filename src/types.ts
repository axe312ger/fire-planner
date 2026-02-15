// ─── FIRE Calculation Types ───

export interface FireConfig {
  currentAge: number;
  targetAge: number;
  annualExpenses: number;
  withdrawalRate: number;
  inflationRate: number;
  currentPortfolio: number;
  currentCash: number;
  monthlyInvestment: number; // total monthly savings capacity (before rent/mortgage)
  monthlyRent: number; // rent paid until property purchase
  parentLoanYears: number; // years to repay parent loan (interest-free)
  returnRates: number[]; // e.g. [0.05, 0.07, 0.09]
  startDate?: string; // ISO month "2026-02", default from defaults.ts
  birthMonth?: number; // 1-12, default 5 (May)
}

export interface PropertyConfig {
  price: number;
  downPaymentPercent: number; // e.g. 20 for 20%
  feesPercent: number; // e.g. 12 for 12%
  additionalCosts: number; // interior, renovation, etc.
  purchaseYear: number; // year offset from now (e.g. 3 = in 3 years)
  purchaseMonth?: number; // month offset from start; overrides purchaseYear * 12 when set
  mortgageRate: number; // annual % e.g. 3.2
  mortgageTerm: number; // years
  label: string;
}

export interface MonthProjection {
  month: number;           // 1-based offset from start
  date: string;            // "2026-03", "2026-04"...
  age: number;             // integer age (changes at birthday month)
  phase: string;           // "Renting", "Mortgage + Parent Loan", "Mortgage Only"
  startBalance: number;
  contribution: number;    // this month's investment
  growth: number;          // this month's portfolio growth
  propertyWithdrawal: number;
  propertyLabel?: string;
  parentLoan?: number;
  endBalance: number;
  monthlyRent: number;
  monthlyMortgage: number;
  monthlyParentLoan: number;
  monthlyInvesting: number;
}

export interface YearProjection {
  year: number;
  age: number;
  startBalance: number;
  contributions: number;
  growth: number;
  propertyWithdrawal: number;
  propertyLabel?: string;
  parentLoan?: number; // Amount borrowed from parents to cover property gap
  endBalance: number;
}

export interface Scenario {
  label: string;
  returnRate: number;
  projections: YearProjection[];
  monthProjections: MonthProjection[];
  fireReachedYear: number | null;
  fireReachedAge: number | null;
  fireReachedMonth: number | null;
  fireReachedDate: string | null; // "2038-07"
  finalBalance: number;
  feasible: boolean;
  parentLoanTotal?: number; // Total borrowed from parents for all properties
  phases?: ScenarioPhase[]; // Monthly budget breakdown per phase
}

export interface ScenarioPhase {
  label: string;
  fromAge: number;
  toAge: number;
  monthlyInvesting: number;
  monthlyMortgage: number;
  monthlyParentLoan: number;
  monthlyRent: number;
}

export interface MortgageResult {
  label: string;
  propertyPrice: number;
  loanAmount: number;
  downPayment: number;
  fees: number;
  totalCashNeeded: number;
  monthlyPayment: number;
  mortgageRate: number;
  termYears: number;
}

export interface GapAnalysis {
  fireNumber: number;
  inflationAdjustedFireNumber: number;
  totalPropertyCash: number;
  totalNeeded: number;
  currentAssets: number;
  gap: number;
  requiredMonthly: number;
  currentMonthly: number;
  monthlyShortfall: number;
}

// ─── Portfolio / CSV Types ───

export interface CsvTransaction {
  date: string;
  time: string;
  status: string;
  reference: string;
  description: string;
  assetType: string;
  type: string; // "Savings plan", "Fee", "Distribution", "Interest"
  isin: string;
  shares: number;
  price: number;
  amount: number;
  fee: number;
  tax: number;
  currency: string;
}

export interface Position {
  isin: string;
  name: string;
  totalShares: number;
  totalInvested: number;
  averagePrice: number;
  currentPrice: number;
  currentValue: number;
  monthlyInvestment: number;
  transactionCount: number;
  category: AssetCategory;
  metadata?: AssetMetadata;
}

export type AssetCategory =
  | 'global-etf'
  | 'regional-etf'
  | 'sector-etf'
  | 'bond-etf'
  | 'commodity'
  | 'individual-stock'
  | 'crypto'
  | 'other';

export interface AssetMetadata {
  name: string;
  ticker?: string;
  quoteType?: string; // ETF, EQUITY, ETC, MUTUALFUND
  ter?: number;
  distributionType?: 'distributing' | 'accumulating';
  currentPrice?: number;
  currency?: string;
  topHoldings?: Holding[];
  sectorWeightings?: Record<string, number>;
  countryAllocation?: Record<string, number>;
  category?: AssetCategory;
}

export interface Holding {
  name: string;
  weight: number; // percentage 0-100
}

export interface PortfolioAnalysis {
  totalInvested: number;
  totalCurrentValue: number;
  totalMonthlyInvestment: number;
  positionCount: number;
  positions: Position[];
  categoryAllocation: Record<AssetCategory, { value: number; percent: number }>;
  regionAllocation: Record<string, { value: number; percent: number }>;
  overlaps: OverlapWarning[];
  concentrationWarnings: string[];
}

export interface OverlapWarning {
  isin1: string;
  name1: string;
  isin2: string;
  name2: string;
  sharedHoldings: string[];
  overlapPercent: number;
}

export interface Suggestion {
  priority: 'high' | 'medium' | 'low';
  action: 'increase' | 'decrease' | 'sell' | 'add' | 'switch';
  message: string;
  detail?: string;
}

// ─── Cache Types ───

export interface CacheEntry<T> {
  data: T;
  cachedAt: number; // epoch ms
  ttl: number; // ms
}

export interface CacheStore {
  [key: string]: CacheEntry<unknown>;
}
