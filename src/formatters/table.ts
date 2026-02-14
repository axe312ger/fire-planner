import chalk from 'chalk';
import type { FireConfig, GapAnalysis, MortgageResult, PropertyConfig, Scenario, ScenarioPhase, YearProjection } from '../types.js';
import { formatEur, formatEurDetailed, formatPct, formatPctPoints, theme } from './colors.js';
import { futureValue } from '../calculators/compound.js';
import { propertyCashNeeded } from '../calculators/fire.js';
import { monthlyMortgagePayment } from '../calculators/mortgage.js';

/**
 * Pad a string to a given width (right-padded).
 */
function pad(str: string, width: number): string {
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

  if (scenario.parentLoanTotal) {
    lines.push(theme.warning(`  Parent loan needed: ${formatEur(scenario.parentLoanTotal)}`));
    lines.push('');
  }

  // Column headers
  const cols = [
    pad('Year', 6),
    pad('Age', 5),
    rpad('Start', 12),
    rpad('+ Invest', 12),
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
 * Render monthly budget phases — shows how money flows change over time.
 */
export function renderPhases(config: FireConfig, phases: ScenarioPhase[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(theme.heading('━━━ Monthly Budget Phases ━━━'));
  lines.push('');
  lines.push(theme.muted(`  Total monthly savings capacity: ${formatEur(config.monthlyInvestment)}/mo`));
  lines.push('');

  for (const phase of phases) {
    const ageRange = phase.fromAge === phase.toAge
      ? `Age ${phase.fromAge}`
      : `Age ${phase.fromAge}-${phase.toAge}`;

    lines.push(theme.subheading(`  ${phase.label} (${ageRange})`));
    lines.push(`    ${formatEur(config.monthlyInvestment)}/mo savings capacity`);

    if (phase.monthlyRent > 0) {
      lines.push(`  - ${formatEurDetailed(phase.monthlyRent)}/mo rent`);
    }
    if (phase.monthlyMortgage > 0) {
      lines.push(`  - ${formatEurDetailed(phase.monthlyMortgage)}/mo mortgage`);
    }
    if (phase.monthlyParentLoan > 0) {
      lines.push(`  - ${formatEurDetailed(phase.monthlyParentLoan)}/mo parent loan repayment`);
    }

    lines.push(`  ${chalk.bold('=')} ${chalk.bold(formatEurDetailed(phase.monthlyInvesting))}/mo ${chalk.bold('→ investing for FIRE')}`);
    lines.push('');
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
  lines.push(`  Monthly capacity:     ${formatEur(monthlyInvestment)}`);
  lines.push(`  Timeline:             Age ${currentAge} → ${targetAge} (${targetAge - currentAge} years)`);
  return lines.join('\n');
}

/**
 * Render a detailed step-by-step breakdown of property purchase calculations.
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

  // Step 2: Monthly savings
  lines.push('');
  lines.push(theme.subheading('  Step 2: Monthly Savings Capacity'));
  lines.push(`    Gross monthly savings:      ${formatEur(config.monthlyInvestment)}/mo`);
  if (config.monthlyRent > 0) {
    lines.push(`    Minus rent (until flat):    -${formatEur(config.monthlyRent)}/mo`);
    lines.push(`    Net monthly (pre-purchase): ${formatEur(config.monthlyInvestment - config.monthlyRent)}/mo`);
  }

  // Step 3+: For each property
  let currentAssets = config.currentPortfolio + config.currentCash;
  let currentMonthly = config.monthlyInvestment - (config.monthlyRent ?? 0);

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    const months = prop.purchaseYear * 12;

    // Cash needed
    lines.push('');
    lines.push(theme.subheading(`  Step ${3 + i * 3}: ${prop.label} — Cash Needed`));
    lines.push(`    Property price:             ${formatEur(prop.price)}`);
    const downPayment = prop.price * prop.downPaymentPercent / 100;
    const fees = prop.price * prop.feesPercent / 100;
    lines.push(`    Down payment (${prop.downPaymentPercent}%):        ${formatEur(downPayment)}`);
    lines.push(`    Transaction fees (${prop.feesPercent}%):    ${formatEur(fees)}`);
    if (prop.additionalCosts > 0) {
      lines.push(`    Interior / renovation:      ${formatEur(prop.additionalCosts)}`);
    }
    const cashNeeded = propertyCashNeeded(prop);
    lines.push(`    ${chalk.bold('Total cash needed:')}          ${chalk.bold(formatEur(cashNeeded))}`);

    // Projected savings
    lines.push('');
    lines.push(theme.subheading(`  Step ${4 + i * 3}: Projected Savings at Purchase (Year ${prop.purchaseYear})`));
    lines.push(theme.muted(`    Using ${(returnRate * 100).toFixed(0)}% annual return, compounded monthly over ${months} months:`));
    lines.push('');

    const monthlyRate = returnRate / 12;
    const factor = Math.pow(1 + monthlyRate, months);
    const pvGrowth = currentAssets * factor;
    const contribGrowth = monthlyRate > 0 ? currentMonthly * ((factor - 1) / monthlyRate) : currentMonthly * months;
    const projected = pvGrowth + contribGrowth;

    lines.push(`    FV = PV × (1 + r/12)^n + PMT × ((1 + r/12)^n - 1) / (r/12)`);
    lines.push('');
    lines.push(`    PV  = ${formatEur(currentAssets)} (current assets)`);
    lines.push(`    PMT = ${formatEur(currentMonthly)}/mo (monthly savings after rent)`);
    lines.push(`    r   = ${(returnRate * 100).toFixed(0)}% per year`);
    lines.push(`    n   = ${months} months`);
    lines.push('');
    lines.push(`    Growth on existing:     ${formatEur(currentAssets)} → ${formatEur(pvGrowth)}`);
    lines.push(`    Growth on contributions: ${formatEur(currentMonthly)}/mo → ${formatEur(contribGrowth)}`);
    lines.push(`    ${chalk.bold('Projected total:')}        ${chalk.bold(formatEur(projected))}`);

    // Gap
    const gap = cashNeeded - projected;
    lines.push('');
    lines.push(theme.subheading(`  Step ${5 + i * 3}: Gap — ${prop.label}`));
    lines.push(`    Cash needed:                ${formatEur(cashNeeded)}`);
    lines.push(`    Projected savings:          ${formatEur(projected)}`);

    if (gap > 0) {
      lines.push(`    ${chalk.red.bold('GAP (parent loan):')}          ${chalk.red.bold(formatEur(gap))}`);
    } else {
      lines.push(`    ${chalk.green.bold('Surplus:')}                     ${chalk.green.bold(formatEur(-gap))}`);
    }

    // Post-purchase mortgage impact
    const loanAmount = prop.price * (1 - prop.downPaymentPercent / 100);
    const mortgageMonthly = monthlyMortgagePayment(loanAmount, prop.mortgageRate, prop.mortgageTerm);
    const parentLoanMonthly = gap > 0 && config.parentLoanYears > 0
      ? gap / (config.parentLoanYears * 12)
      : 0;

    lines.push('');
    lines.push(theme.subheading(`  Post-Purchase: Monthly Budget`));
    lines.push(`    ${formatEur(config.monthlyInvestment)}/mo  savings capacity`);
    lines.push(`  - ${formatEurDetailed(mortgageMonthly)}/mo  mortgage (${formatEur(loanAmount)} at ${formatPctPoints(prop.mortgageRate)}%, ${prop.mortgageTerm}yr)`);
    if (parentLoanMonthly > 0) {
      lines.push(`  - ${formatEurDetailed(parentLoanMonthly)}/mo  parent loan (${formatEur(gap)} over ${config.parentLoanYears}yr)`);
    }
    const investingAfter = Math.max(0, config.monthlyInvestment - mortgageMonthly - parentLoanMonthly);
    lines.push(`  = ${chalk.bold(formatEurDetailed(investingAfter))}/mo  ${chalk.bold('→ FIRE investing')}`);

    if (parentLoanMonthly > 0) {
      const afterParentLoan = Math.max(0, config.monthlyInvestment - mortgageMonthly);
      lines.push('');
      lines.push(theme.muted(`    After parent loan paid off (${config.parentLoanYears}yr): ${formatEurDetailed(afterParentLoan)}/mo → investing`));
    }

    // Update running state
    currentAssets = Math.max(0, projected - cashNeeded);
    currentMonthly = investingAfter;
  }

  return lines.join('\n');
}
