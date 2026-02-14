#!/usr/bin/env node
import { Command } from 'commander';
import { calculateCommand } from './commands/calculate.js';
import { analyzeCommand } from './commands/analyze.js';
import { suggestCommand } from './commands/suggest.js';

const program = new Command();

program
  .name('fire-planner')
  .description('FIRE (Financial Independence, Retire Early) planner with portfolio analysis')
  .version('1.0.0');

program
  .command('calculate')
  .description('Calculate FIRE scenarios with year-by-year projections')
  .option('--age <n>', 'Current age', '35')
  .option('--target-age <n>', 'Target retirement age', '45')
  .option('--expenses <n>', 'Annual expenses in EUR', '60000')
  .option('--withdrawal-rate <n>', 'Safe withdrawal rate', '0.04')
  .option('--inflation <n>', 'Annual inflation rate', '0.02')
  .option('--portfolio <n>', 'Current portfolio value in EUR', '9000')
  .option('--cash <n>', 'Current cash savings in EUR', '7500')
  .option('--monthly <n>', 'Monthly investment in EUR', '1000')
  .option('--flat-price <n>', 'Flat purchase price in EUR', '500000')
  .option('--flat-down <n>', 'Flat down payment %', '20')
  .option('--flat-fees <n>', 'Flat purchase fees %', '12')
  .option('--flat-year <n>', 'Year to buy flat (offset from now)', '3')
  .option('--finca-price <n>', 'Finca purchase price in EUR', '500000')
  .option('--finca-down <n>', 'Finca down payment %', '30')
  .option('--finca-fees <n>', 'Finca purchase fees %', '12')
  .option('--finca-year <n>', 'Year to buy finca (offset from now)', '7')
  .option('--rates <list>', 'Return rates to model (comma-separated %)', '5,7,9')
  .option('--mortgage-rate <n>', 'Annual mortgage rate %', '3.2')
  .action(calculateCommand);

program
  .command('analyze <csv>')
  .description('Analyze Scalable Capital portfolio from CSV export')
  .option('--refresh', 'Force re-fetch from APIs, ignore cache')
  .action(analyzeCommand);

program
  .command('suggest <csv>')
  .description('Analyze portfolio and generate FIRE-aligned suggestions')
  .option('--refresh', 'Force re-fetch from APIs, ignore cache')
  .option('--monthly <n>', 'Monthly investment in EUR', '1000')
  .option('--expenses <n>', 'Annual expenses in EUR', '60000')
  .action(suggestCommand);

program.parse();
