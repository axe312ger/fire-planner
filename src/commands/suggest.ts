import chalk from 'chalk';
import { parseScalableCsv } from '../parsers/scalable-csv.js';
import { analyzePortfolio } from '../analyzers/portfolio.js';
import { generateSuggestions } from '../analyzers/suggestions.js';
import { gapAnalysis } from '../calculators/fire.js';
import { DEFAULT_FIRE_CONFIG } from '../config/defaults.js';
import { theme, formatEur } from '../formatters/colors.js';
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
  const moderateRate = config.returnRates[Math.floor(config.returnRates.length / 2)] ?? 0.07;
  const gap = gapAnalysis(config, [], moderateRate);

  console.log(renderGapAnalysis(gap));
  console.log('');

  // Generate suggestions
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

  // Per-position suggestions
  if (positionSuggestions.length > 0) {
    console.log(theme.heading('━━━ Per-Position Analysis ━━━\n'));

    for (const s of positionSuggestions) {
      printPositionSuggestion(s);
    }
  }
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
