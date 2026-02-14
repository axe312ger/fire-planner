import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type { FireConfig, PropertyConfig, ScenarioPhase } from '../types.js';
import { DEFAULT_FIRE_CONFIG, DEFAULT_FLAT, DEFAULT_FINCA } from '../config/defaults.js';
import { fireNumber, inflationAdjustedFireNumber, propertyCashNeeded } from '../calculators/fire.js';
import { buildScenario } from '../calculators/scenarios.js';
import { monthlyMortgagePayment } from '../calculators/mortgage.js';
import { formatEur, formatEurDetailed, theme } from '../formatters/colors.js';

/**
 * Target allocation for FIRE-optimized investing.
 * These percentages define how monthly investment is split across categories.
 */
interface Allocation {
  label: string;
  percent: number;
}

const DEFAULT_ALLOCATION: Allocation[] = [
  { label: 'Global ETFs', percent: 60 },
  { label: 'Emerging Markets', percent: 10 },
  { label: 'Gold / Commodities', percent: 10 },
  { label: 'Individual Stocks', percent: 15 },
  { label: 'Bond ETFs', percent: 5 },
];

interface PlanOptions {
  age?: string;
  targetAge?: string;
  expenses?: string;
  portfolio?: string;
  cash?: string;
  monthly?: string;
  rent?: string;
  parentLoanYears?: string;
  flatPrice?: string;
  flatDown?: string;
  flatFees?: string;
  flatInterior?: string;
  flatYear?: string;
  flatTerm?: string;
  fincaPrice?: string;
  rate?: string;
  mortgageRate?: string;
  output?: string;
}

export function planCommand(opts: PlanOptions): void {
  const config: FireConfig = {
    currentAge: num(opts.age, DEFAULT_FIRE_CONFIG.currentAge),
    targetAge: num(opts.targetAge, DEFAULT_FIRE_CONFIG.targetAge),
    annualExpenses: num(opts.expenses, DEFAULT_FIRE_CONFIG.annualExpenses),
    withdrawalRate: DEFAULT_FIRE_CONFIG.withdrawalRate,
    inflationRate: DEFAULT_FIRE_CONFIG.inflationRate,
    currentPortfolio: num(opts.portfolio, DEFAULT_FIRE_CONFIG.currentPortfolio),
    currentCash: num(opts.cash, DEFAULT_FIRE_CONFIG.currentCash),
    monthlyInvestment: num(opts.monthly, DEFAULT_FIRE_CONFIG.monthlyInvestment),
    monthlyRent: num(opts.rent, DEFAULT_FIRE_CONFIG.monthlyRent),
    parentLoanYears: num(opts.parentLoanYears, DEFAULT_FIRE_CONFIG.parentLoanYears),
    returnRates: DEFAULT_FIRE_CONFIG.returnRates,
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
  const properties: PropertyConfig[] = [];
  if (flat.price > 0) properties.push(flat);
  if (fincaPrice > 0) {
    properties.push({
      ...DEFAULT_FINCA,
      price: fincaPrice,
      mortgageRate: mortRate,
    });
  }

  const returnRate = num(opts.rate, 7) / 100;
  const scenario = buildScenario(config, properties, returnRate);

  const years = config.targetAge - config.currentAge;
  const allocation = DEFAULT_ALLOCATION;

  // ─── Build CSV rows ───
  const rows: string[][] = [];

  // Header
  const header = [
    'Year',
    'Age',
    'Phase',
    'Monthly Savings',
    'Monthly Rent',
    'Monthly Mortgage',
    'Monthly Parent Loan',
    'Monthly Investing',
    ...allocation.map((a) => `${a.label} (${a.percent}%)`),
    'Annual Invested',
    'Portfolio Growth',
    'Portfolio Balance',
    'FIRE Target (inflation-adj)',
    'Progress %',
  ];
  rows.push(header);

  // Determine phase for each year
  const firstPurchaseYear = properties.length > 0
    ? Math.min(...properties.map((p) => p.purchaseYear))
    : Infinity;

  let monthlyMortgage = 0;
  let monthlyParentLoan = 0;
  let parentLoanEndYear = 0;

  for (const prop of properties) {
    if (prop.purchaseYear === firstPurchaseYear) {
      const loanAmount = prop.price * (1 - prop.downPaymentPercent / 100);
      monthlyMortgage = monthlyMortgagePayment(loanAmount, prop.mortgageRate, prop.mortgageTerm);
    }
  }

  // Calculate parent loan from scenario
  const parentLoanTotal = scenario.parentLoanTotal ?? 0;
  if (parentLoanTotal > 0 && config.parentLoanYears > 0) {
    monthlyParentLoan = parentLoanTotal / (config.parentLoanYears * 12);
    parentLoanEndYear = firstPurchaseYear + config.parentLoanYears;
  }

  for (let y = 1; y <= years; y++) {
    const age = config.currentAge + y;
    const proj = scenario.projections[y - 1];

    // Phase
    let phase: string;
    let rent = 0;
    let mortgage = 0;
    let parentLoan = 0;

    if (y <= firstPurchaseYear) {
      phase = 'Renting';
      rent = config.monthlyRent;
    } else if (y <= parentLoanEndYear) {
      phase = 'Mortgage + Parent Loan';
      mortgage = monthlyMortgage;
      parentLoan = monthlyParentLoan;
    } else if (firstPurchaseYear < Infinity) {
      phase = 'Mortgage Only';
      mortgage = monthlyMortgage;
    } else {
      phase = 'Investing';
    }

    const monthlyInvesting = Math.max(0, config.monthlyInvestment - rent - mortgage - parentLoan);

    // Category allocation
    const categoryAmounts = allocation.map((a) =>
      fmtNum(monthlyInvesting * a.percent / 100),
    );

    // FIRE target for this year
    const fireTarget = inflationAdjustedFireNumber(
      config.annualExpenses,
      config.withdrawalRate,
      config.inflationRate,
      y,
    );
    const progress = proj.endBalance > 0 ? (proj.endBalance / fireTarget) * 100 : 0;

    rows.push([
      String(y),
      String(age),
      phase,
      fmtNum(config.monthlyInvestment),
      fmtNum(rent),
      fmtNum(mortgage),
      fmtNum(parentLoan),
      fmtNum(monthlyInvesting),
      ...categoryAmounts,
      fmtNum(proj.contributions),
      fmtNum(proj.growth),
      fmtNum(proj.endBalance),
      fmtNum(fireTarget),
      `${progress.toFixed(1)}%`,
    ]);
  }

  // ─── Add summary section ───
  rows.push([]);
  rows.push(['═══ SUMMARY ═══']);
  rows.push(['FIRE Number (today)', fmtNum(fireNumber(config.annualExpenses, config.withdrawalRate))]);
  rows.push(['Annual Expenses', fmtNum(config.annualExpenses)]);
  rows.push(['Withdrawal Rate', `${(config.withdrawalRate * 100).toFixed(1)}%`]);
  rows.push(['Return Rate Used', `${(returnRate * 100).toFixed(0)}%`]);
  rows.push(['Parent Loan Total', fmtNum(parentLoanTotal)]);
  rows.push(['Parent Loan Monthly', fmtNum(monthlyParentLoan)]);
  rows.push(['Mortgage Monthly', fmtNum(monthlyMortgage)]);
  rows.push([]);

  rows.push(['═══ INVESTMENT ALLOCATION ═══']);
  rows.push(['Category', 'Target %', 'Phase 1 (rent)', 'Phase 2 (mort+loan)', 'Phase 3 (mort only)']);

  const phase1Monthly = Math.max(0, config.monthlyInvestment - config.monthlyRent);
  const phase2Monthly = Math.max(0, config.monthlyInvestment - monthlyMortgage - monthlyParentLoan);
  const phase3Monthly = Math.max(0, config.monthlyInvestment - monthlyMortgage);

  for (const a of allocation) {
    rows.push([
      a.label,
      `${a.percent}%`,
      fmtNum(phase1Monthly * a.percent / 100),
      fmtNum(phase2Monthly * a.percent / 100),
      fmtNum(phase3Monthly * a.percent / 100),
    ]);
  }
  rows.push(['TOTAL', '100%', fmtNum(phase1Monthly), fmtNum(phase2Monthly), fmtNum(phase3Monthly)]);

  // ─── Write CSV ───
  const csv = rows.map((row) => row.map(escCsv).join(';')).join('\n');
  const outputPath = opts.output
    ? resolve(opts.output)
    : resolve(process.cwd(), 'fire-plan.csv');

  writeFileSync(outputPath, csv, 'utf-8');

  // ─── Terminal output ───
  console.log(theme.heading('\n━━━ FIRE Investment Plan ━━━\n'));
  console.log(`  Return rate: ${(returnRate * 100).toFixed(0)}% | FIRE target: ${formatEur(fireNumber(config.annualExpenses, config.withdrawalRate))}`);
  console.log(`  Parent loan: ${formatEur(parentLoanTotal)} (${config.parentLoanYears}yr @ ${formatEurDetailed(monthlyParentLoan)}/mo)`);
  console.log('');

  // Phase allocation table
  console.log(theme.subheading('  Monthly Investment Allocation by Phase:'));
  console.log('');

  const colW = 18;
  const phases = [
    { label: `Rent (age ${config.currentAge + 1})`, monthly: phase1Monthly },
    { label: `Mort+Loan (${config.currentAge + firstPurchaseYear + 1}-${config.currentAge + parentLoanEndYear})`, monthly: phase2Monthly },
    { label: `Mort only (${config.currentAge + parentLoanEndYear + 1}-${config.targetAge})`, monthly: phase3Monthly },
  ];

  // Header
  const tableHeader = '  ' + pad('Category', 22) + phases.map((p) => rpad(p.label, colW)).join('');
  console.log(chalk.bold(tableHeader));
  console.log(theme.muted('  ' + '─'.repeat(22 + phases.length * colW)));

  for (const a of allocation) {
    const row = '  ' + pad(a.label + ` (${a.percent}%)`, 22) + phases.map((p) =>
      rpad(formatEurDetailed(p.monthly * a.percent / 100), colW),
    ).join('');
    console.log(row);
  }

  console.log(theme.muted('  ' + '─'.repeat(22 + phases.length * colW)));
  const totalRow = '  ' + pad(chalk.bold('TOTAL →'), 22) + phases.map((p) =>
    rpad(chalk.bold(formatEurDetailed(p.monthly)), colW),
  ).join('');
  console.log(totalRow);

  console.log('');
  console.log(`  Final portfolio at ${config.targetAge}: ${formatEur(scenario.finalBalance)}`);
  const finalFire = inflationAdjustedFireNumber(config.annualExpenses, config.withdrawalRate, config.inflationRate, years);
  const finalPct = (scenario.finalBalance / finalFire) * 100;
  console.log(`  FIRE target (inflation-adj): ${formatEur(finalFire)}`);
  console.log(`  Progress: ${finalPct.toFixed(1)}%`);
  console.log('');
  console.log(theme.positive(`  ✓ Plan exported to: ${outputPath}`));
  console.log('');
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

function fmtNum(n: number): string {
  return n.toFixed(2);
}

function escCsv(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function pad(str: string, width: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = width - stripped.length;
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

function rpad(str: string, width: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = width - stripped.length;
  return diff > 0 ? ' '.repeat(diff) + str : str;
}
