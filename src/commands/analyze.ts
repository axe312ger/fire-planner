import chalk from 'chalk';
import { parseScalableCsv } from '../parsers/scalable-csv.js';
import { analyzePortfolio } from '../analyzers/portfolio.js';
import { theme, formatEur, formatEurDetailed, formatPctPoints } from '../formatters/colors.js';

interface AnalyzeOptions {
  refresh?: boolean;
}

export async function analyzeCommand(csvPath: string, opts: AnalyzeOptions): Promise<void> {
  console.log(theme.heading('\n━━━ Portfolio Analysis ━━━\n'));

  // Parse CSV
  const transactions = parseScalableCsv(csvPath);
  console.log(theme.muted(`  Parsed ${transactions.length} transactions from CSV\n`));

  // Analyze
  const analysis = await analyzePortfolio(transactions, opts.refresh ?? false, (msg) => {
    console.log(theme.muted(`  ${msg}`));
  });

  console.log('');

  // Summary
  const gainLoss = analysis.totalCurrentValue - analysis.totalInvested;
  const gainLossPct = analysis.totalInvested > 0
    ? ((gainLoss / analysis.totalInvested) * 100).toFixed(1)
    : '0.0';
  console.log(theme.subheading('  Overview'));
  console.log(`    Cost basis:           ${formatEur(analysis.totalInvested)}`);
  console.log(`    Est. current value:   ${formatEur(analysis.totalCurrentValue)}  (${gainLoss >= 0 ? '+' : ''}${formatEur(gainLoss)}, ${gainLoss >= 0 ? '+' : ''}${gainLossPct}%)`);
  console.log(`    Monthly savings plans: ${formatEurDetailed(analysis.totalMonthlyInvestment)}/mo`);
  console.log(`    Positions:            ${analysis.positionCount}`);
  console.log(theme.muted('    Note: Values use last known prices from CSV, not live market data'));
  console.log('');

  // Category allocation
  console.log(theme.subheading('  Allocation by Category'));
  const sortedCategories = Object.entries(analysis.categoryAllocation)
    .sort((a, b) => b[1].percent - a[1].percent);
  for (const [cat, alloc] of sortedCategories) {
    const bar = makeBar(alloc.percent);
    console.log(`    ${padRight(formatCategoryName(cat), 20)} ${bar} ${formatPctPoints(alloc.percent).padStart(7)}  (${formatEur(alloc.value)})`);
  }
  console.log('');

  // Region allocation
  console.log(theme.subheading('  Allocation by Region'));
  const sortedRegions = Object.entries(analysis.regionAllocation)
    .sort((a, b) => b[1].percent - a[1].percent);
  for (const [region, alloc] of sortedRegions) {
    const bar = makeBar(alloc.percent);
    console.log(`    ${padRight(region, 20)} ${bar} ${formatPctPoints(alloc.percent).padStart(7)}  (${formatEur(alloc.value)})`);
  }
  console.log('');

  // Overlap warnings
  if (analysis.overlaps.length > 0) {
    console.log(theme.warning('  ETF Overlap Warnings'));
    for (const o of analysis.overlaps) {
      console.log(theme.warning(`    ⚠ ${o.name1} ↔ ${o.name2}: ${o.overlapPercent.toFixed(0)}% overlap`));
      console.log(theme.muted(`      Shared: ${o.sharedHoldings.slice(0, 5).join(', ')}`));
    }
    console.log('');
  }

  // Concentration flags
  if (analysis.concentrationWarnings.length > 0) {
    console.log(theme.warning('  Concentration Warnings'));
    for (const w of analysis.concentrationWarnings) {
      console.log(theme.warning(`    ⚠ ${w}`));
    }
    console.log('');
  }

  // Per-position detail table
  console.log(theme.subheading('  Position Details'));
  console.log(
    chalk.bold(
      `    ${padRight('Name', 35)} ${padRight('ISIN', 14)} ${padLeft('Cost', 9)} ${padLeft('Value', 9)} ${padLeft('P/L', 8)} ${padLeft('/mo', 9)} ${padLeft('TER', 7)} ${padRight('Type', 6)}`,
    ),
  );
  console.log(theme.muted('    ' + '─'.repeat(100)));

  const sortedPositions = [...analysis.positions].sort((a, b) => b.currentValue - a.currentValue);
  for (const pos of sortedPositions) {
    const ter = pos.metadata?.ter ? `${(pos.metadata.ter * 100).toFixed(2)}%` : '—';
    const dist = pos.metadata?.distributionType
      ? pos.metadata.distributionType === 'accumulating' ? 'Acc' : 'Dist'
      : '—';
    const name = pos.name.length > 33 ? pos.name.substring(0, 33) + '..' : pos.name;
    const pl = pos.currentValue - pos.totalInvested;
    const plStr = pl >= 0 ? theme.positive(`+${formatEur(pl)}`) : theme.negative(formatEur(pl));

    console.log(
      `    ${padRight(name, 35)} ${padRight(pos.isin, 14)} ${padLeft(formatEur(pos.totalInvested), 9)} ${padLeft(formatEur(pos.currentValue), 9)} ${padLeft(plStr, 8)} ${padLeft(formatEurDetailed(pos.monthlyInvestment), 9)} ${padLeft(ter, 7)} ${padRight(dist, 6)}`,
    );
  }

  console.log('');
}

function padRight(str: string, width: number): string {
  return str.length >= width ? str.substring(0, width) : str + ' '.repeat(width - str.length);
}

function padLeft(str: string, width: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = width - stripped.length;
  return diff > 0 ? ' '.repeat(diff) + str : str;
}

function makeBar(percent: number, maxWidth = 20): string {
  const filled = Math.max(0, Math.min(maxWidth, Math.round((percent / 100) * maxWidth)));
  return chalk.cyan('█'.repeat(filled)) + theme.muted('░'.repeat(maxWidth - filled));
}

function formatCategoryName(cat: string): string {
  return cat
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
