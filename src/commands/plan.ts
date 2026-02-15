import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type { FireConfig, PropertyConfig, ScenarioPhase } from '../types.js';
import { DEFAULT_FIRE_CONFIG, DEFAULT_FLAT, DEFAULT_FINCA } from '../config/defaults.js';
import { fireNumber, inflationAdjustedFireNumberAtMonth, propertyCashNeeded } from '../calculators/fire.js';
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
  { label: 'Global + EM (MSCI ACWI)', percent: 70 },
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
  rentStartMonth?: string;
  flatPrice?: string;
  flatDown?: string;
  flatFees?: string;
  flatInterior?: string;
  flatYear?: string;
  flatMonth?: string;
  flatTerm?: string;
  fincaPrice?: string;
  rate?: string;
  mortgageRate?: string;
  output?: string;
  yearly?: boolean;
  startDate?: string;
  birthMonth?: string;
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
    rentStartMonth: opts.rentStartMonth !== undefined ? num(opts.rentStartMonth, DEFAULT_FIRE_CONFIG.rentStartMonth!) : DEFAULT_FIRE_CONFIG.rentStartMonth,
    parentLoanYears: num(opts.parentLoanYears, DEFAULT_FIRE_CONFIG.parentLoanYears),
    returnRates: DEFAULT_FIRE_CONFIG.returnRates,
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
    purchaseMonth: opts.flatMonth ? num(opts.flatMonth, undefined!) : undefined,
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

  const allocation = DEFAULT_ALLOCATION;
  const startDate = config.startDate ?? DEFAULT_FIRE_CONFIG.startDate!;
  const yearly = opts.yearly ?? false;

  // ─── Build CSV rows ───
  const rows: string[][] = [];

  // Header
  const header = [
    'Date',
    'Age',
    'Phase',
    'Monthly Savings',
    'Monthly Rent',
    'Monthly Mortgage',
    'Monthly Parent Loan',
    'Monthly Investing',
    ...allocation.map((a) => `${a.label} (${a.percent}%)`),
    'Contribution',
    'Growth',
    'Portfolio Balance',
    'FIRE Target (inflation-adj)',
    'Progress %',
  ];
  rows.push(header);

  // Row 0: Starting Position
  {
    const startBalance = config.currentPortfolio + config.currentCash;
    const baseFire = fireNumber(config.annualExpenses, config.withdrawalRate);
    const startProgress = startBalance > 0 ? (startBalance / baseFire) * 100 : 0;
    const rentAtStart = (config.rentStartMonth ?? 0) > 0 ? 0 : config.monthlyRent;
    const startInvesting = Math.max(0, config.monthlyInvestment - rentAtStart);
    rows.push([
      startDate,
      String(config.currentAge),
      'Starting Position',
      fmtNum(config.monthlyInvestment),
      fmtNum(rentAtStart),
      '0.00',
      '0.00',
      fmtNum(startInvesting),
      ...allocation.map(() => '0.00'),
      '0.00',
      '0.00',
      fmtNum(startBalance),
      fmtNum(baseFire),
      `${startProgress.toFixed(1)}%`,
    ]);
  }

  // Monthly or yearly rows
  const projections = scenario.monthProjections;

  for (const mp of projections) {
    // If --yearly flag, only emit every 12th month (year-end)
    if (yearly && mp.month % 12 !== 0) continue;

    const fireTarget = inflationAdjustedFireNumberAtMonth(
      config.annualExpenses,
      config.withdrawalRate,
      config.inflationRate,
      mp.month,
    );
    const progress = mp.endBalance > 0 ? (mp.endBalance / fireTarget) * 100 : 0;

    // Category allocation
    const categoryAmounts = allocation.map((a) =>
      fmtNum(mp.monthlyInvesting * a.percent / 100),
    );

    rows.push([
      mp.date,
      String(mp.age),
      mp.phase,
      fmtNum(config.monthlyInvestment),
      fmtNum(mp.monthlyRent),
      fmtNum(mp.monthlyMortgage),
      fmtNum(mp.monthlyParentLoan),
      fmtNum(mp.monthlyInvesting),
      ...categoryAmounts,
      fmtNum(mp.contribution),
      fmtNum(mp.growth),
      fmtNum(mp.endBalance),
      fmtNum(fireTarget),
      `${progress.toFixed(1)}%`,
    ]);
  }

  // ─── Add summary section ───
  rows.push([]);
  rows.push(['═══ SUMMARY ═══']);
  rows.push(['FIRE Number (today)', fmtNum(fireNumber(config.annualExpenses, config.withdrawalRate))]);
  rows.push(['Starting Portfolio', fmtNum(config.currentPortfolio)]);
  rows.push(['Starting Cash', fmtNum(config.currentCash)]);
  rows.push(['Monthly Savings', fmtNum(config.monthlyInvestment)]);
  rows.push(['Annual Expenses', fmtNum(config.annualExpenses)]);
  rows.push(['Withdrawal Rate', `${(config.withdrawalRate * 100).toFixed(1)}%`]);
  rows.push(['Return Rate Used', `${(returnRate * 100).toFixed(0)}%`]);

  const parentLoanTotal = scenario.parentLoanTotal ?? 0;
  const monthlyParentLoan = parentLoanTotal > 0 ? parentLoanTotal / (config.parentLoanYears * 12) : 0;

  // Determine mortgage payment for summary
  const firstPurchaseMonth = properties.length > 0
    ? Math.min(...properties.map((p) => p.purchaseMonth ?? p.purchaseYear * 12))
    : Infinity;
  let monthlyMortgage = 0;
  for (const prop of properties) {
    const pm = prop.purchaseMonth ?? prop.purchaseYear * 12;
    if (pm === firstPurchaseMonth) {
      const loanAmount = prop.price * (1 - prop.downPaymentPercent / 100);
      monthlyMortgage = monthlyMortgagePayment(loanAmount, prop.mortgageRate, prop.mortgageTerm);
    }
  }

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
  console.log(`  Granularity: ${yearly ? 'yearly (--yearly)' : 'monthly'} | ${projections.length} data points`);
  console.log('');

  // Phase allocation table
  console.log(theme.subheading('  Monthly Investment Allocation by Phase:'));
  console.log('');

  const firstPurchaseYear = Math.ceil(firstPurchaseMonth / 12);
  const parentLoanEndYear = monthlyParentLoan > 0 ? firstPurchaseYear + config.parentLoanYears : 0;

  const colW = 18;
  const terminalPhases = [
    { label: `Rent (age ${config.currentAge + 1})`, monthly: phase1Monthly },
    { label: `Mort+Loan (${config.currentAge + firstPurchaseYear + 1}-${config.currentAge + parentLoanEndYear})`, monthly: phase2Monthly },
    { label: `Mort only (${config.currentAge + parentLoanEndYear + 1}-${config.targetAge})`, monthly: phase3Monthly },
  ];

  // Header
  const tableHeader = '  ' + pad('Category', 22) + terminalPhases.map((p) => rpad(p.label, colW)).join('');
  console.log(chalk.bold(tableHeader));
  console.log(theme.muted('  ' + '─'.repeat(22 + terminalPhases.length * colW)));

  for (const a of allocation) {
    const row = '  ' + pad(a.label + ` (${a.percent}%)`, 22) + terminalPhases.map((p) =>
      rpad(formatEurDetailed(p.monthly * a.percent / 100), colW),
    ).join('');
    console.log(row);
  }

  console.log(theme.muted('  ' + '─'.repeat(22 + terminalPhases.length * colW)));
  const totalRow = '  ' + pad(chalk.bold('TOTAL →'), 22) + terminalPhases.map((p) =>
    rpad(chalk.bold(formatEurDetailed(p.monthly)), colW),
  ).join('');
  console.log(totalRow);

  console.log('');
  console.log(`  Final portfolio at ${config.targetAge}: ${formatEur(scenario.finalBalance)}`);
  const lastMonth = projections[projections.length - 1];
  const finalFire = inflationAdjustedFireNumberAtMonth(config.annualExpenses, config.withdrawalRate, config.inflationRate, lastMonth.month);
  const finalPct = (scenario.finalBalance / finalFire) * 100;
  console.log(`  FIRE target (inflation-adj): ${formatEur(finalFire)}`);
  console.log(`  Progress: ${finalPct.toFixed(1)}%`);
  if (scenario.fireReachedDate) {
    console.log(`  FIRE reached: ${scenario.fireReachedDate} (age ${scenario.fireReachedAge})`);
  }
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
