import chalk from 'chalk';
import { parseScalableCsv } from '../parsers/scalable-csv.js';
import { analyzePortfolio } from '../analyzers/portfolio.js';
import { generateSuggestions } from '../analyzers/suggestions.js';
import { generateRecommendation, type SavingsPlanAction } from '../analyzers/recommendation.js';
import { gapAnalysis } from '../calculators/fire.js';
import { DEFAULT_FIRE_CONFIG } from '../config/defaults.js';
import { theme, formatEur, formatEurDetailed } from '../formatters/colors.js';
import { renderGapAnalysis } from '../formatters/table.js';
import { analyzeCommand } from './analyze.js';

interface SuggestOptions {
  refresh?: boolean;
  monthly?: string;
  expenses?: string;
}

export async function suggestCommand(csvPath: string, opts: SuggestOptions): Promise<void> {
  // First, run the full analysis output
  await analyzeCommand(csvPath, { refresh: opts.refresh });

  // Parse CSV again for suggestion engine
  const transactions = parseScalableCsv(csvPath);
  const analysis = await analyzePortfolio(transactions, false); // use cache from analyze

  // Build gap analysis
  const config = {
    ...DEFAULT_FIRE_CONFIG,
    monthlyInvestment: opts.monthly ? parseFloat(opts.monthly) : DEFAULT_FIRE_CONFIG.monthlyInvestment,
    annualExpenses: opts.expenses ? parseFloat(opts.expenses) : DEFAULT_FIRE_CONFIG.annualExpenses,
    currentPortfolio: analysis.totalCurrentValue,
  };

  // Phase 1 monthly budget: savings capacity minus rent
  const phase1Monthly = config.monthlyInvestment - (config.monthlyRent ?? 0);

  const moderateRate = config.returnRates[Math.floor(config.returnRates.length / 2)] ?? 0.07;
  const gap = gapAnalysis(config, [], moderateRate);

  console.log(renderGapAnalysis(gap));
  console.log('');

  // Generate general suggestions
  const suggestions = generateSuggestions(analysis, gap);

  // Split into portfolio-level and per-position
  const dividerIdx = suggestions.findIndex((s) => s.message.includes('Per-Position'));
  const portfolioSuggestions = dividerIdx >= 0 ? suggestions.slice(0, dividerIdx) : suggestions;
  const positionSuggestions = dividerIdx >= 0 ? suggestions.slice(dividerIdx + 1) : [];

  // Portfolio-level suggestions
  console.log(theme.heading('━━━ Portfolio Suggestions ━━━\n'));

  if (portfolioSuggestions.length === 0) {
    console.log(theme.positive('  Your portfolio allocation looks good!\n'));
  } else {
    for (const s of portfolioSuggestions) {
      printSuggestion(s);
    }
  }

  // ─── Concrete Savings Plan Recommendation ───
  const recommendation = generateRecommendation(analysis, phase1Monthly);
  printRecommendation(recommendation, phase1Monthly, config.monthlyInvestment, config.monthlyRent ?? 0);

  // Per-position suggestions
  if (positionSuggestions.length > 0) {
    console.log(theme.heading('━━━ Per-Position Analysis ━━━\n'));

    for (const s of positionSuggestions) {
      printPositionSuggestion(s);
    }
  }
}

function printRecommendation(
  actions: SavingsPlanAction[],
  monthlyBudget: number,
  totalCapacity: number,
  rent: number,
): void {
  console.log(theme.heading('━━━ Recommended Savings Plan ━━━'));
  console.log('');
  console.log(theme.muted(`  Phase 1: ${formatEur(totalCapacity)}/mo capacity - ${formatEur(rent)} rent = ${formatEur(monthlyBudget)}/mo for investing`));
  console.log('');

  // Group by category
  const categories = new Map<string, SavingsPlanAction[]>();
  for (const a of actions) {
    const list = categories.get(a.category) ?? [];
    list.push(a);
    categories.set(a.category, list);
  }

  // Print header
  const cols = [
    pad('Action', 10),
    pad('Position', 36),
    rpad('Current', 10),
    rpad('Target', 10),
    rpad('Change', 10),
    pad('Reason', 45),
  ];
  console.log(chalk.bold('  ' + cols.join(' ')));
  console.log(theme.muted('  ' + '─'.repeat(125)));

  let totalCurrent = 0;
  let totalTarget = 0;

  // Print increases and keeps first
  const increases = actions.filter((a) => a.action === 'increase' || a.action === 'keep');
  if (increases.length > 0) {
    let currentCategory = '';
    for (const a of increases) {
      if (a.category !== currentCategory) {
        currentCategory = a.category;
        console.log(theme.subheading(`\n  ${currentCategory}`));
      }
      printActionRow(a);
      totalCurrent += a.currentMonthly;
      totalTarget += a.targetMonthly;
    }
  }

  // Print adds
  const adds = actions.filter((a) => a.action === 'add');
  if (adds.length > 0) {
    let currentCategory = '';
    for (const a of adds) {
      if (a.category !== currentCategory) {
        currentCategory = a.category;
        console.log(theme.subheading(`\n  ${currentCategory} (NEW)`));
      }
      printActionRow(a);
      totalTarget += a.targetMonthly;
    }
  }

  // Print cancels
  const cancels = actions.filter((a) => a.action === 'cancel');
  if (cancels.length > 0) {
    console.log(theme.subheading('\n  Cancel these savings plans'));
    for (const a of cancels) {
      printActionRow(a);
      totalCurrent += a.currentMonthly;
    }
  }

  // Summary
  console.log('');
  console.log(theme.muted('  ' + '─'.repeat(125)));
  const summaryRow = [
    pad(chalk.bold('TOTAL'), 10),
    pad('', 36),
    rpad(formatEurDetailed(totalCurrent), 10),
    rpad(formatEurDetailed(totalTarget), 10),
    rpad(formatChange(totalTarget - totalCurrent), 10),
    pad('', 45),
  ];
  console.log(chalk.bold('  ' + summaryRow.join(' ')));

  // Quick summary stats
  const increaseCount = increases.filter((a) => a.action === 'increase').length;
  const keepCount = increases.filter((a) => a.action === 'keep').length;
  const addCount = adds.length;
  const cancelCount = cancels.length;

  console.log('');
  console.log(theme.muted(`  Changes: ${increaseCount} increase, ${keepCount} keep, ${addCount} add new, ${cancelCount} cancel`));
  console.log(theme.muted(`  Savings plans: ${increases.length + adds.length} active (down from ${increases.length + adds.length + cancels.length})`));

  // Tax guidance for cancelled positions (Spanish tax resident)
  if (cancels.length > 0) {
    console.log('');
    console.log(theme.subheading('  Tax-efficient cleanup (Spain):'));
    console.log(theme.muted('  1. Cancel ALL savings plans above, then sell the shares too — positions are'));
    console.log(theme.muted('     small now, so the tax impact is minimal (19% on gains, no free allowance).'));
    console.log(theme.muted('  2. Pair winners + losers in the same tax year to offset gains with losses.'));
    console.log(theme.muted('  3. 2-month wash sale rule: if selling at a loss, do NOT rebuy the same ISIN'));
    console.log(theme.muted('     within 2 months — otherwise the loss is deferred, not recognized.'));
    console.log(theme.muted('  4. FIFO applies: oldest shares are sold first. Check your actual cost basis.'));
    console.log(theme.muted('  5. Redirect freed capital into SC MSCI AC World (0% TER until Jun 2026).'));
    console.log(theme.muted('  6. Declare everything in your annual Renta (Apr-Jun). Use Scalable\'s tax report.'));
  }

  console.log('');
}

function printActionRow(a: SavingsPlanAction): void {
  const actionLabel = actionBadge(a.action);
  const name = a.name.length > 34 ? a.name.substring(0, 33) + '…' : a.name;
  const current = a.currentMonthly > 0 ? formatEurDetailed(a.currentMonthly) : '—';
  const target = a.targetMonthly > 0 ? formatEurDetailed(a.targetMonthly) : '—';
  const change = formatChange(a.change);

  const row = [
    pad(actionLabel, 10),
    pad(name, 36),
    rpad(current, 10),
    rpad(target, 10),
    rpad(change, 10),
    pad(theme.muted(a.reason), 45),
  ];
  console.log('  ' + row.join(' '));
}

function actionBadge(action: string): string {
  switch (action) {
    case 'increase': return chalk.green.bold('INCREASE');
    case 'keep': return chalk.blue.bold('KEEP');
    case 'add': return chalk.cyan.bold('ADD NEW');
    case 'cancel': return chalk.red.bold('CANCEL');
    default: return chalk.bold(action.toUpperCase());
  }
}

function formatChange(amount: number): string {
  if (amount === 0) return theme.muted('—');
  if (amount > 0) return chalk.green(`+${formatEurDetailed(amount)}`);
  return chalk.red(`${formatEurDetailed(amount)}`);
}

function printSuggestion(s: { priority: string; action: string; message: string; detail?: string }): void {
  const icon = s.priority === 'high' ? chalk.red('●') : s.priority === 'medium' ? chalk.yellow('●') : chalk.gray('●');
  const actionLabel = actionColor(s.action, `[${s.action.toUpperCase()}]`);
  console.log(`  ${icon} ${actionLabel} ${s.message}`);
  if (s.detail) {
    console.log(theme.muted(`    ${s.detail}`));
  }
  console.log('');
}

function printPositionSuggestion(s: { priority: string; action: string; message: string; detail?: string }): void {
  const icon = s.priority === 'high' ? chalk.red('●') : s.priority === 'medium' ? chalk.yellow('●') : chalk.green('●');
  const actionLabel = actionColor(s.action, `[${s.action.toUpperCase()}]`);
  console.log(`  ${icon} ${actionLabel} ${chalk.bold(s.message)}`);
  if (s.detail) {
    for (const line of s.detail.split('\n')) {
      console.log(theme.muted(`      ${line.trim()}`));
    }
  }
  console.log('');
}

function actionColor(action: string, text: string): string {
  switch (action) {
    case 'increase': return chalk.green.bold(text);
    case 'add': return chalk.green.bold(text);
    case 'decrease': return chalk.yellow.bold(text);
    case 'sell': return chalk.red.bold(text);
    case 'switch': return chalk.magenta.bold(text);
    default: return chalk.bold(text);
  }
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
