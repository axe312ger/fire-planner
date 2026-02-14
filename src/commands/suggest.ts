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

  console.log(theme.heading('━━━ Suggestions ━━━\n'));

  if (suggestions.length === 0) {
    console.log(theme.positive('  Your portfolio looks well-structured! No major suggestions.\n'));
    return;
  }

  for (const s of suggestions) {
    const icon = s.priority === 'high' ? chalk.red('●') : s.priority === 'medium' ? chalk.yellow('●') : chalk.gray('●');
    const actionLabel = chalk.bold(`[${s.action.toUpperCase()}]`);
    console.log(`  ${icon} ${actionLabel} ${s.message}`);
    if (s.detail) {
      console.log(theme.muted(`    ${s.detail}`));
    }
    console.log('');
  }
}
