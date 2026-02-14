import chalk from 'chalk';
import type { GapAnalysis, MortgageResult, Scenario, YearProjection } from '../types.js';
import { formatEur, formatEurDetailed, formatPct, formatPctPoints, theme } from './colors.js';

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

  // Column headers
  const cols = [
    pad('Year', 6),
    pad('Age', 5),
    rpad('Start', 12),
    rpad('+ Contrib', 12),
    rpad('+ Growth', 12),
    rpad('- Property', 12),
    rpad('End Balance', 14),
    pad('', 10),
  ];
  lines.push(chalk.bold(cols.join(' ')));
  lines.push(theme.muted('─'.repeat(90)));

  for (const p of scenario.projections) {
    const fireTag =
      scenario.fireReachedYear === p.year ? chalk.green.bold(' ★ FIRE!') : '';
    const propTag = p.propertyLabel ? theme.warning(` ← ${p.propertyLabel}`) : '';

    const row = [
      pad(String(p.year), 6),
      pad(String(p.age), 5),
      rpad(formatEur(p.startBalance), 12),
      rpad(formatEur(p.contributions), 12),
      rpad(formatEur(p.growth), 12),
      rpad(p.propertyWithdrawal > 0 ? formatEur(p.propertyWithdrawal) : theme.muted('—'), 12),
      rpad(theme.money(p.endBalance).replace(/\x1b\[.*?m/g, '') ? formatEur(p.endBalance) : formatEur(p.endBalance), 14),
      fireTag + propTag,
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

  const header = [
    pad('Scenario', 24),
    rpad('Return', 8),
    rpad('Final Balance', 15),
    rpad('FIRE Age', 10),
    pad('Feasible', 10),
  ];
  lines.push(chalk.bold(header.join(' ')));
  lines.push(theme.muted('─'.repeat(70)));

  for (const s of scenarios) {
    const row = [
      pad(s.label, 24),
      rpad(formatPctPoints(s.returnRate * 100), 8),
      rpad(formatEur(s.finalBalance), 15),
      rpad(s.fireReachedAge ? `${s.fireReachedAge}` : 'Not reached', 10),
      pad(s.feasible ? theme.positive('Yes') : theme.negative('No'), 10),
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
