import chalk from 'chalk';
import type { FireConfig, GapAnalysis, MortgageResult, PropertyConfig, Scenario, YearProjection } from '../types.js';
import { formatEur, formatEurDetailed, formatPct, formatPctPoints, theme } from './colors.js';
import { futureValue } from '../calculators/compound.js';
import { propertyCashNeeded } from '../calculators/fire.js';
import { monthlyMortgagePayment } from '../calculators/mortgage.js';

/**
 * Pad a string to a given width (right-padded).
 */
function pad(str: string, width: number): string {
  // Strip ANSI codes for length calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = width - stripped.length;
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

/**
 * Right-align a string within a given width.
 */
function rpad(str: string, width: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = width - stripped.length;
  return diff > 0 ? ' '.repeat(diff) + str : str;
}

/**
 * Render a year-by-year projection table for a scenario.
 */
export function renderScenarioTable(scenario: Scenario): string {
  const lines: string[] = [];
  const header = scenario.label + (scenario.feasible ? '' : chalk.red(' [INFEASIBLE]'));
  lines.push('');
  lines.push(theme.heading(`━━━ ${header} ━━━`));
  lines.push('');

  // Show parent loan info if applicable
  if (scenario.parentLoanTotal) {
    lines.push(theme.warning(`  Parent loan needed: ${formatEur(scenario.parentLoanTotal)}`));
    lines.push(theme.muted(`  Monthly investment after mortgage: ${formatEur(scenario.monthlyAfterMortgage ?? 0)}/mo`));
    lines.push('');
  }

  // Column headers
  const cols = [
    pad('Year', 6),
    pad('Age', 5),
    rpad('Start', 12),
    rpad('+ Contrib', 12),
    rpad('+ Growth', 12),
    rpad('- Property', 12),
    rpad('End Balance', 14),
    pad('', 20),
  ];
  lines.push(chalk.bold(cols.join(' ')));
  lines.push(theme.muted('─'.repeat(95)));

  for (const p of scenario.projections) {
    const fireTag =
      scenario.fireReachedYear === p.year ? chalk.green.bold(' ★ FIRE!') : '';
    const propTag = p.propertyLabel ? theme.warning(` ← ${p.propertyLabel}`) : '';
    const loanTag = p.parentLoan ? chalk.magenta(` (loan: ${formatEur(p.parentLoan)})`) : '';

    const row = [
      pad(String(p.year), 6),
      pad(String(p.age), 5),
      rpad(formatEur(p.startBalance), 12),
      rpad(formatEur(p.contributions), 12),
      rpad(formatEur(p.growth), 12),
      rpad(p.propertyWithdrawal > 0 ? formatEur(p.propertyWithdrawal) : theme.muted('—'), 12),
      rpad(formatEur(p.endBalance), 14),
      fireTag + propTag + loanTag,
    ];
    lines.push(row.join(' '));
  }

  if (scenario.fireReachedAge) {
    lines.push('');
    lines.push(
      theme.positive(`  → FIRE reached at age ${scenario.fireReachedAge} (year ${scenario.fireReachedYear})`) +
        `  |  Final balance: ${formatEur(scenario.finalBalance)}`,
    );
  } else {
    lines.push('');
    lines.push(
      theme.negative(`  → FIRE NOT reached by age ${scenario.projections.at(-1)?.age}`) +
        `  |  Final balance: ${formatEur(scenario.finalBalance)}`,
    );
  }

  return lines.join('\n');
}

/**
 * Render a comparison table of all scenarios.
 */
export function renderScenarioComparison(scenarios: Scenario[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(theme.heading('━━━ Scenario Comparison ━━━'));
  lines.push('');

  const hasLoan = scenarios.some((s) => s.parentLoanTotal);

  const header = [
    pad('Scenario', 24),
    rpad('Return', 8),
    rpad('Final Balance', 15),
    rpad('FIRE Age', 10),
    pad('Feasible', 10),
    ...(hasLoan ? [rpad('Parent Loan', 14)] : []),
  ];
  lines.push(chalk.bold(header.join(' ')));
  lines.push(theme.muted('─'.repeat(hasLoan ? 84 : 70)));

  for (const s of scenarios) {
    const row = [
      pad(s.label, 24),
      rpad(formatPctPoints(s.returnRate * 100), 8),
      rpad(formatEur(s.finalBalance), 15),
      rpad(s.fireReachedAge ? `${s.fireReachedAge}` : 'Not reached', 10),
      pad(s.feasible ? theme.positive('Yes') : theme.negative('No'), 10),
      ...(hasLoan ? [rpad(s.parentLoanTotal ? formatEur(s.parentLoanTotal) : '—', 14)] : []),
    ];
    lines.push(row.join(' '));
  }

  return lines.join('\n');
}

/**
 * Render gap analysis.
 */
export function renderGapAnalysis(gap: GapAnalysis): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(theme.heading('━━━ Gap Analysis ━━━'));
  lines.push('');
  lines.push(`  FIRE Number (basic):         ${formatEur(gap.fireNumber)}`);
  lines.push(`  FIRE Number (inflation-adj): ${formatEur(gap.inflationAdjustedFireNumber)}`);
  lines.push(`  Property cash needed:        ${formatEur(gap.totalPropertyCash)}`);
  lines.push(`  Total needed:                ${formatEur(gap.totalNeeded)}`);
  lines.push(`  Current assets:              ${formatEur(gap.currentAssets)}`);
  lines.push(`  Gap:                         ${theme.money(gap.gap)}`);
  lines.push('');
  lines.push(`  Required monthly investment: ${formatEur(gap.requiredMonthly)}`);
  lines.push(`  Current monthly investment:  ${formatEur(gap.currentMonthly)}`);

  if (gap.monthlyShortfall > 0) {
    lines.push(`  Monthly shortfall:           ${theme.negative(formatEur(gap.monthlyShortfall))}`);
  } else {
    lines.push(`  Monthly surplus:             ${theme.positive(formatEur(-gap.monthlyShortfall))}`);
  }

  return lines.join('\n');
}

/**
 * Render mortgage summary.
 */
export function renderMortgageSummary(mortgages: MortgageResult[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(theme.heading('━━━ Mortgage Summary (informational) ━━━'));
  lines.push('');

  for (const m of mortgages) {
    lines.push(theme.subheading(`  ${m.label}`));
    lines.push(`    Property price:     ${formatEur(m.propertyPrice)}`);
    lines.push(`    Down payment:       ${formatEur(m.downPayment)}`);
    lines.push(`    Fees (~12%):        ${formatEur(m.fees)}`);
    lines.push(`    Cash needed:        ${formatEur(m.totalCashNeeded)}`);
    lines.push(`    Loan amount:        ${formatEur(m.loanAmount)}`);
    lines.push(`    Rate:               ${formatPctPoints(m.mortgageRate)} fixed`);
    lines.push(`    Term:               ${m.termYears} years`);
    lines.push(`    Monthly payment:    ${formatEurDetailed(m.monthlyPayment)}`);
    lines.push('');
  }

  const totalMonthly = mortgages.reduce((s, m) => s + m.monthlyPayment, 0);
  lines.push(`  Total monthly mortgage outflow: ${formatEurDetailed(totalMonthly)}`);

  return lines.join('\n');
}

/**
 * Render a simple summary header.
 */
export function renderSummaryHeader(
  fireNum: number,
  currentAssets: number,
  monthlyInvestment: number,
  targetAge: number,
  currentAge: number,
): string {
  const lines: string[] = [];
  lines.push(theme.heading('\n━━━ FIRE Planner ━━━\n'));
  lines.push(`  Target FIRE number:   ${formatEur(fireNum)}`);
  lines.push(`  Current assets:       ${formatEur(currentAssets)}`);
  lines.push(`  Monthly investment:   ${formatEur(monthlyInvestment)}`);
  lines.push(`  Timeline:             Age ${currentAge} → ${targetAge} (${targetAge - currentAge} years)`);
  return lines.join('\n');
}

/**
 * Render a detailed step-by-step breakdown of property purchase calculations.
 * Shows the user exactly how the algorithm arrives at each number.
 */
export function renderDetailedBreakdown(
  config: FireConfig,
  properties: PropertyConfig[],
  returnRate: number,
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(theme.heading('━━━ Detailed Calculation Breakdown ━━━'));

  // Step 1: Starting position
  lines.push('');
  lines.push(theme.subheading('  Step 1: Starting Position'));
  lines.push(`    Portfolio (invested):       ${formatEur(config.currentPortfolio)}`);
  lines.push(`    Cash savings:               ${formatEur(config.currentCash)}`);
  lines.push(`    Total current assets:       ${formatEur(config.currentPortfolio + config.currentCash)}`);
  lines.push(theme.muted(`    (${formatEur(config.currentPortfolio)} + ${formatEur(config.currentCash)} = ${formatEur(config.currentPortfolio + config.currentCash)})`));

  // Step 2: Monthly savings capacity
  lines.push('');
  lines.push(theme.subheading('  Step 2: Monthly Savings'));
  lines.push(`    Monthly investment:         ${formatEur(config.monthlyInvestment)}/mo`);
  lines.push(`    Annual contribution:        ${formatEur(config.monthlyInvestment * 12)}/yr`);
  lines.push(theme.muted(`    (${formatEur(config.monthlyInvestment)} × 12 = ${formatEur(config.monthlyInvestment * 12)})`));

  // Step 3: For each property, show purchase breakdown
  let currentAssets = config.currentPortfolio + config.currentCash;
  let currentMonthly = config.monthlyInvestment;

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    const months = prop.purchaseYear * 12;

    lines.push('');
    lines.push(theme.subheading(`  Step ${3 + i * 3}: ${prop.label} — Cash Needed`));
    lines.push(`    Property price:             ${formatEur(prop.price)}`);
    lines.push(`    Down payment (${prop.downPaymentPercent}%):        ${formatEur(prop.price * prop.downPaymentPercent / 100)}`);
    lines.push(theme.muted(`    (${formatEur(prop.price)} × ${prop.downPaymentPercent}% = ${formatEur(prop.price * prop.downPaymentPercent / 100)})`));
    lines.push(`    Transaction fees (${prop.feesPercent}%):    ${formatEur(prop.price * prop.feesPercent / 100)}`);
    lines.push(theme.muted(`    (${formatEur(prop.price)} × ${prop.feesPercent}% = ${formatEur(prop.price * prop.feesPercent / 100)})`));
    const cashNeeded = propertyCashNeeded(prop);
    lines.push(`    Total cash needed:          ${chalk.bold(formatEur(cashNeeded))}`);
    lines.push(theme.muted(`    (${formatEur(prop.price * prop.downPaymentPercent / 100)} + ${formatEur(prop.price * prop.feesPercent / 100)} = ${formatEur(cashNeeded)})`));

    // Step: Projected savings at purchase time
    lines.push('');
    lines.push(theme.subheading(`  Step ${4 + i * 3}: Projected Savings at Purchase (Year ${prop.purchaseYear})`));
    lines.push(theme.muted(`    Using ${(returnRate * 100).toFixed(0)}% annual return, compounded monthly over ${months} months:`));
    lines.push('');

    // Show the formula
    const monthlyRate = returnRate / 12;
    const factor = Math.pow(1 + monthlyRate, months);
    const pvGrowth = currentAssets * factor;
    const contribGrowth = currentMonthly * ((factor - 1) / monthlyRate);
    const projected = pvGrowth + contribGrowth;

    lines.push(`    Formula: FV = PV × (1 + r/12)^n + PMT × ((1 + r/12)^n - 1) / (r/12)`);
    lines.push('');
    lines.push(`    PV  = ${formatEur(currentAssets)} (current assets)`);
    lines.push(`    PMT = ${formatEur(currentMonthly)}/mo (monthly savings)`);
    lines.push(`    r   = ${(returnRate * 100).toFixed(0)}% per year`);
    lines.push(`    n   = ${months} months (${prop.purchaseYear} year${prop.purchaseYear > 1 ? 's' : ''})`);
    lines.push('');
    lines.push(`    Growth on existing:     ${formatEur(currentAssets)} × ${factor.toFixed(4)} = ${formatEur(pvGrowth)}`);
    lines.push(`    Growth on contributions: ${formatEur(currentMonthly)}/mo × ${((factor - 1) / monthlyRate).toFixed(2)} = ${formatEur(contribGrowth)}`);
    lines.push(`    Projected total:        ${chalk.bold(formatEur(projected))}`);

    // Step: The gap / parent loan
    const gap = cashNeeded - projected;
    lines.push('');
    lines.push(theme.subheading(`  Step ${5 + i * 3}: Gap Analysis — ${prop.label}`));
    lines.push(`    Cash needed for flat:       ${formatEur(cashNeeded)}`);
    lines.push(`    Your projected savings:     ${formatEur(projected)}`);

    if (gap > 0) {
      lines.push(`    ${chalk.red.bold('GAP (parent loan needed):')}    ${chalk.red.bold(formatEur(gap))}`);
      lines.push(theme.muted(`    (${formatEur(cashNeeded)} - ${formatEur(projected)} = ${formatEur(gap)})`));
    } else {
      lines.push(`    ${chalk.green.bold('Surplus:')}                     ${chalk.green.bold(formatEur(-gap))}`);
    }

    // Post-purchase: mortgage impact
    const loanAmount = prop.price * (1 - prop.downPaymentPercent / 100);
    const mortgageMonthly = monthlyMortgagePayment(loanAmount, prop.mortgageRate, prop.mortgageTerm);

    lines.push('');
    lines.push(theme.subheading(`  Post-Purchase: Mortgage Impact`));
    lines.push(`    Mortgage loan:              ${formatEur(loanAmount)}`);
    lines.push(theme.muted(`    (${formatEur(prop.price)} - ${formatEur(prop.price * prop.downPaymentPercent / 100)} down = ${formatEur(loanAmount)})`));
    lines.push(`    Rate:                       ${formatPctPoints(prop.mortgageRate)} fixed, ${prop.mortgageTerm} years`);
    lines.push(`    Monthly mortgage payment:   ${chalk.bold(formatEurDetailed(mortgageMonthly))}`);
    lines.push('');
    lines.push(`    Monthly savings before:     ${formatEur(currentMonthly)}/mo`);
    const newMonthly = Math.max(0, currentMonthly - mortgageMonthly);
    lines.push(`    Minus mortgage:             -${formatEurDetailed(mortgageMonthly)}/mo`);
    lines.push(`    Monthly savings after:      ${newMonthly > 0 ? chalk.bold(formatEur(newMonthly)) : chalk.red.bold(formatEur(newMonthly))}/mo`);
    lines.push(theme.muted(`    (${formatEur(currentMonthly)} - ${formatEurDetailed(mortgageMonthly)} = ${formatEurDetailed(newMonthly)})`));

    if (newMonthly <= 0) {
      lines.push('');
      lines.push(theme.warning(`    ⚠ Mortgage exceeds current savings capacity — no money left for investments!`));
      lines.push(theme.muted(`    You would need to increase income or reduce expenses to continue investing.`));
    }

    // Update running state for next property
    currentAssets = Math.max(0, projected - cashNeeded);
    currentMonthly = newMonthly;
  }

  return lines.join('\n');
}
